import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  getActiveRoot,
  listNodeDefs,
  listReferences,
  listTemplatesFull,
  listAssetsFull,
  readSettings,
} from "@/lib/server/workspace";
import { compileRuleForEngine } from "@/lib/rule/compile-to-engine";
import type {
  NodeDef,
  ReferenceSet,
  Rule,
  RuleNodeInstance,
  RuleEdge,
  EdgeBranch,
  NodeBindings,
  PortBinding,
  JsonSchema,
} from "@/lib/types";

// AI authoring (the AI-core front door). Takes a *policy* (pasted text or an
// uploaded file) and asks Claude to produce a complete rule: input/output
// schemas, the node graph (instances + edges + bindings), per-node
// explanations, an end-to-end narrative, clause citations, and test scenarios.
// The draft is validated by dry-run-compiling it to the engine shape; if it
// fails, Claude is asked to repair it once.

const EMPTY_SCHEMA: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {},
  required: [],
};

type Body = {
  policy?: { text?: string; file?: { base64: string; mediaType: string; name?: string } };
  schemaMode?: "ai" | "provided";
  providedSchemas?: { inputSchema?: JsonSchema; outputSchema?: JsonSchema; contextSchema?: JsonSchema };
  identity?: { name?: string; id?: string; endpoint?: string; category?: string };
};

export async function POST(req: NextRequest) {
  const settings = await readSettings();
  if ((settings.aiProvider ?? "anthropic") !== "anthropic") {
    return NextResponse.json(
      { error: "AI authoring runs on Claude. Set Settings → AI provider → Anthropic." },
      { status: 400 },
    );
  }
  const apiKey = settings.anthropicApiKey?.trim() || process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "No Anthropic API key set. Add it under Settings → AI provider → Anthropic." },
      { status: 400 },
    );
  }
  const model = settings.anthropicModel?.trim() || "claude-opus-4-8";

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const hasPolicy = Boolean(body.policy?.text?.trim() || body.policy?.file?.base64);
  if (!hasPolicy) {
    return NextResponse.json({ error: "Provide a policy — paste text or upload a file." }, { status: 400 });
  }
  const schemaMode: "ai" | "provided" = body.schemaMode === "provided" ? "provided" : "ai";

  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace open." }, { status: 409 });

  let nodeDefs: NodeDef[] = [];
  let references: ReferenceSet[] = [];
  let templates: Awaited<ReturnType<typeof listTemplatesFull>> = [];
  let assets: Awaited<ReturnType<typeof listAssetsFull>> = [];
  try {
    [nodeDefs, references, templates, assets] = await Promise.all([
      listNodeDefs(root),
      listReferences(root),
      listTemplatesFull(root),
      listAssetsFull(root),
    ]);
  } catch (err) {
    return NextResponse.json({ error: `Could not load workspace catalog: ${(err as Error).message}` }, { status: 500 });
  }

  const system = buildSystemPrompt(nodeDefs, references, schemaMode);
  const userContent = buildUserContent(body, schemaMode);

  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userContent }];

  // First attempt.
  let result: { draft: AuthorDraft | null; text: string; usage: Anthropic.Usage };
  try {
    result = await runClaude(client, model, system, messages);
  } catch (err) {
    const e = err as { status?: number; message?: string };
    return NextResponse.json(
      { error: `Claude request failed: ${e.message ?? "unknown error"}${e.status === 401 ? " (check the API key)" : ""}` },
      { status: e.status === 401 ? 401 : 502 },
    );
  }
  if (!result.draft) {
    return NextResponse.json(
      { error: "Claude replied, but I couldn't parse a rule. Try rephrasing or simplifying the policy.", raw: result.text.slice(0, 2000) },
      { status: 502 },
    );
  }

  // Validate by dry-run compiling; repair once if it fails.
  let validationError = validate(result.draft, body, schemaMode, nodeDefs, references, templates, assets);
  let totalUsage = result.usage;
  if (validationError) {
    const repairMessages: Anthropic.MessageParam[] = [
      { role: "user", content: userContent },
      { role: "assistant", content: result.text },
      {
        role: "user",
        content: `That rule failed to compile: ${validationError}\n\nFix the problem and return the COMPLETE corrected JSON only (same shape, no prose).`,
      },
    ];
    try {
      const repaired = await runClaude(client, model, system, repairMessages);
      if (repaired.draft) {
        const stillBad = validate(repaired.draft, body, schemaMode, nodeDefs, references, templates, assets);
        result = repaired;
        validationError = stillBad;
        totalUsage = repaired.usage;
      }
    } catch {
      /* keep the first draft + its validationError */
    }
  }

  if (!result.draft) {
    return NextResponse.json(
      { error: "Could not produce a valid rule from that policy. Try rephrasing it.", raw: result.text.slice(0, 2000) },
      { status: 502 },
    );
  }
  const d = result.draft;
  const inputSchema = schemaMode === "provided" ? body.providedSchemas?.inputSchema ?? EMPTY_SCHEMA : d.inputSchema ?? EMPTY_SCHEMA;
  const outputSchema = schemaMode === "provided" ? body.providedSchemas?.outputSchema ?? EMPTY_SCHEMA : d.outputSchema ?? EMPTY_SCHEMA;
  const contextSchema = schemaMode === "provided" ? body.providedSchemas?.contextSchema : d.contextSchema;

  return NextResponse.json({
    draft: {
      inputSchema,
      outputSchema,
      contextSchema,
      instances: d.instances ?? [],
      edges: d.edges ?? [],
      bindings: d.bindings ?? {},
      tests: d.tests ?? [],
    },
    aiMeta: {
      sourcePolicyName: body.policy?.file?.name ?? undefined,
      narrative: d.aiMeta?.narrative ?? d.rationale ?? "",
      nodeExplanations: d.aiMeta?.nodeExplanations ?? {},
      citations: d.aiMeta?.citations ?? [],
      generatedBy: model,
    },
    rationale: d.rationale ?? "",
    validationError: validationError ?? null,
    usage: {
      input: totalUsage.input_tokens,
      output: totalUsage.output_tokens,
      cacheRead: totalUsage.cache_read_input_tokens ?? 0,
    },
  });
}

// ---------------------------------------------------------------------------

type AuthorDraft = {
  rationale?: string;
  inputSchema?: JsonSchema;
  outputSchema?: JsonSchema;
  contextSchema?: JsonSchema;
  instances?: Array<{ instanceId?: string; nodeId?: string; label?: string; x?: number; y?: number }>;
  edges?: Array<{ source?: string; target?: string; branch?: string }>;
  bindings?: Record<string, { bindings?: Record<string, PortBinding>; extras?: Record<string, unknown> }>;
  tests?: Array<{ name?: string; payload?: unknown }>;
  aiMeta?: {
    narrative?: string;
    nodeExplanations?: Record<string, string>;
    citations?: Array<{ instanceId: string; clause: string; quote?: string }>;
  };
};

async function runClaude(
  client: Anthropic,
  model: string,
  system: string,
  messages: Anthropic.MessageParam[],
): Promise<{ draft: AuthorDraft | null; text: string; usage: Anthropic.Usage }> {
  const message = await client.messages
    .stream({
      model,
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages,
    })
    .finalMessage();
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  return { draft: parseDraft(text), text, usage: message.usage };
}

function buildUserContent(body: Body, schemaMode: "ai" | "provided"): Anthropic.MessageParam["content"] {
  const id = body.identity ?? {};
  const lines: string[] = [];
  lines.push(`Author a RuleForge rule that implements the policy below.`);
  if (id.name || id.endpoint || id.category) {
    lines.push(`\nRule identity: name="${id.name ?? ""}", endpoint="${id.endpoint ?? ""}", category="${id.category ?? ""}".`);
  }
  if (schemaMode === "provided" && body.providedSchemas) {
    lines.push(
      `\nThe input/output schemas are PROVIDED — do NOT redesign them; use these field names exactly:\ninputSchema=${JSON.stringify(body.providedSchemas.inputSchema ?? {})}\noutputSchema=${JSON.stringify(body.providedSchemas.outputSchema ?? {})}`,
    );
  } else {
    lines.push(`\nDesign the request inputSchema and response outputSchema (JSON Schema) implied by the policy.`);
  }

  if (body.policy?.text?.trim()) {
    lines.push(`\n--- POLICY ---\n${body.policy.text.trim()}\n--- END POLICY ---`);
  }
  lines.push(`\nReturn the JSON rule now.`);
  const prompt = lines.join("\n");

  // PDF / document upload → Claude reads it natively as a document block.
  if (body.policy?.file?.base64) {
    const f = body.policy.file;
    return [
      { type: "document", source: { type: "base64", media_type: f.mediaType || "application/pdf", data: f.base64 } } as Anthropic.DocumentBlockParam,
      { type: "text", text: prompt },
    ];
  }
  return prompt;
}

// --- validation: dry-run compile to the engine shape -----------------------

function validate(
  draft: AuthorDraft,
  body: Body,
  schemaMode: "ai" | "provided",
  nodeDefs: NodeDef[],
  refs: ReferenceSet[],
  templates: Awaited<ReturnType<typeof listTemplatesFull>>,
  assets: Awaited<ReturnType<typeof listAssetsFull>>,
): string | null {
  const instances = toInstances(draft.instances);
  if (instances.length === 0) return "the draft has no usable nodes";
  const rule: Rule = {
    id: body.identity?.id || "draft",
    name: body.identity?.name || "Draft",
    endpoint: body.identity?.endpoint || "/v1/draft",
    method: "POST",
    status: "draft",
    currentVersion: 1,
    inputSchema: (schemaMode === "provided" ? body.providedSchemas?.inputSchema : draft.inputSchema) ?? EMPTY_SCHEMA,
    outputSchema: (schemaMode === "provided" ? body.providedSchemas?.outputSchema : draft.outputSchema) ?? EMPTY_SCHEMA,
    contextSchema: draft.contextSchema ?? EMPTY_SCHEMA,
    instances,
    edges: toEdges(draft.edges, instances),
    bindings: toBindings(draft.bindings, instances, body.identity?.id || "draft"),
    tests: [],
    updatedAt: new Date().toISOString(),
  };
  try {
    compileRuleForEngine(rule, nodeDefs, { refs, templates, assets });
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}

function toInstances(raw: AuthorDraft["instances"]): RuleNodeInstance[] {
  return (raw ?? [])
    .filter((i) => i?.instanceId && i?.nodeId)
    .map((i) => ({
      instanceId: i.instanceId as string,
      nodeId: i.nodeId as string,
      position: { x: Number(i.x ?? 0), y: Number(i.y ?? 0) },
      label: i.label,
    }));
}

function toEdges(raw: AuthorDraft["edges"], instances: RuleNodeInstance[]): RuleEdge[] {
  const ids = new Set(instances.map((i) => i.instanceId));
  return (raw ?? [])
    .filter((e) => e?.source && e?.target && ids.has(e.source as string) && ids.has(e.target as string))
    .map((e, i) => ({
      id: `e-${i + 1}`,
      source: e.source as string,
      target: e.target as string,
      branch: ((e.branch as EdgeBranch) ?? "default") as EdgeBranch,
    }));
}

function toBindings(raw: AuthorDraft["bindings"], instances: RuleNodeInstance[], ruleId: string): Record<string, NodeBindings> {
  const ids = new Set(instances.map((i) => i.instanceId));
  const out: Record<string, NodeBindings> = {};
  for (const [iid, nb] of Object.entries(raw ?? {})) {
    if (!ids.has(iid)) continue;
    out[iid] = {
      instanceId: iid,
      ruleId,
      bindings: (nb?.bindings ?? {}) as Record<string, PortBinding>,
      ...(nb?.extras && typeof nb.extras === "object" ? { extras: nb.extras } : {}),
    };
  }
  return out;
}

function parseDraft(text: string): AuthorDraft | null {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  if (!s.startsWith("{")) {
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
  }
  try {
    const parsed = JSON.parse(s) as AuthorDraft;
    if (!parsed || !Array.isArray(parsed.instances) || !Array.isArray(parsed.edges)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// --- system prompt ---------------------------------------------------------

function buildSystemPrompt(nodeDefs: NodeDef[], references: ReferenceSet[], schemaMode: "ai" | "provided"): string {
  const catalog = nodeDefs.map(describeNode).join("\n");
  const refs = references.length ? references.map(describeRef).join("\n") : "(none)";
  const schemaInstruction =
    schemaMode === "provided"
      ? `The input/output schemas are PROVIDED in the user message — use those field names; set "inputSchema"/"outputSchema" in your JSON to those exact schemas.`
      : `DESIGN the request "inputSchema" and response "outputSchema" (JSON Schema draft 2020-12) that the policy implies. Keep them minimal and concrete.`;

  return `You are RuleForge's policy-to-rule compiler. RuleForge evaluates a request through a DAG of nodes and returns a decision/result, executed by a deterministic engine. You turn a plain-language POLICY into a complete, runnable rule.

Output ONLY a single JSON object — no markdown fences, no prose outside it. Shape:
{
  "rationale": "one or two sentences on the rule you built",
  "inputSchema": { ...JSON Schema for the request... },
  "outputSchema": { ...JSON Schema for the response... },
  "instances": [ { "instanceId": "n1", "nodeId": "node-input", "label": "Request", "x": 80, "y": 240 } ],
  "edges": [ { "source": "n1", "target": "n2", "branch": "default" } ],
  "bindings": { "n2": { "bindings": { "<port>": <PortBinding> }, "extras": { "matchOn": {}, "fields": {} } } },
  "tests": [ { "name": "Happy path", "payload": {} } ],
  "aiMeta": {
    "narrative": "a clear end-to-end technical explanation of what the rule does, step by step",
    "nodeExplanations": { "n2": "Plain-English description of what this node does" },
    "citations": [ { "instanceId": "n2", "clause": "§ or heading the node implements", "quote": "short verbatim snippet from the policy" } ]
  }
}

${schemaInstruction}
Write an "aiMeta.nodeExplanations" entry for EVERY non-terminal node, and a "citations" entry tracing each substantive node back to the policy text. The narrative should read like documentation a reviewer can check against the policy.

Lay nodes out left-to-right: x increases ~220 per step, y around 240 (fan parallel lookups to 140 / 340).

PortBinding is one of:
- { "kind": "literal", "value": <any> }            // a fixed value
- { "kind": "path", "path": "$.fieldName" }          // read a field from the request (use your inputSchema's field names)
- { "kind": "reference", "referenceId": "ref-x" }    // ONLY for a lookup node's referenceId port

House style:
1. Exactly ONE node-input and ONE node-output; wire everything with edges (branch "default" unless a node has pass/fail outputs).
2. Seed a working object with node-constant (literal object of every field you'll fill).
3. Copy request fields with node-mutator-map (extras.fields: { target: { kind:"path", path:"$.x" } }).
4. Table lookups with node-mutator-lookup: target (literal field), referenceId (kind reference), valueColumn (literal), onMissing (literal "leave"); extras.matchOn maps key columns to REQUEST paths only (never computed values).
5. Compute with node-calc: target (literal field) + expression (literal NCalc). Branch via if(cond,a,b). Bare names resolve from the working object/request.
6. Filters/asserts have pass/fail outputs — use branch "pass"/"fail".

Available node types:
${catalog}

Available reference tables (use exact ids + columns):
${refs}

Prefer the simplest graph that works; only use node types and reference ids listed above. Generate 2-4 varied, valid test payloads.`;
}

function describeNode(d: NodeDef): string {
  const ins = (d.ports?.inputs ?? []).map((p) => `${p.name}:${p.type}${p.required ? "*" : ""}(in)`);
  const params = (d.ports?.params ?? []).map((p) => {
    const rawEnum = (p as { enum?: Array<{ value?: string } | string> }).enum;
    const enumVals = Array.isArray(rawEnum)
      ? `=[${rawEnum.map((e) => (typeof e === "string" ? e : e?.value)).filter(Boolean).join("|")}]`
      : "";
    return `${p.name}:${p.type}${p.required ? "*" : ""}${enumVals}`;
  });
  const ports = [...ins, ...params].join(", ") || "(no config)";
  const outs = (d.ports?.outputs ?? []).map((o) => o.branch ?? o.name).join("/") || "out";
  const special =
    d.id === "node-mutator-lookup" ? "  [+extras.matchOn]"
    : d.id === "node-mutator-map" ? "  [config via extras.fields]"
    : "";
  return `- ${d.id} [${d.category}] ${d.name}: ${ports} → ${outs}${special}`;
}

function describeRef(r: ReferenceSet): string {
  const rows =
    (r as unknown as { rows?: Array<Record<string, unknown>>; data?: Array<Record<string, unknown>> }).rows ??
    (r as unknown as { data?: Array<Record<string, unknown>> }).data ??
    [];
  const cols = rows[0] ? Object.keys(rows[0]) : [];
  const sample = rows[0] ? ` e.g. ${JSON.stringify(rows[0])}` : "";
  return `- ${r.id}${r.name ? ` (${r.name})` : ""}: columns [${cols.join(", ")}], ${rows.length} rows.${sample}`;
}
