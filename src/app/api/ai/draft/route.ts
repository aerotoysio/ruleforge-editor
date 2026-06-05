import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getActiveRoot, listNodeDefs, listReferences, readSettings } from "@/lib/server/workspace";
import type { NodeDef, ReferenceSet } from "@/lib/types";

// AI rule drafting via Claude (Anthropic). The user describes a scenario in
// plain language; Claude returns a draft rule (instances + edges + bindings)
// in the editor's shape plus a few test scenarios. The big static context
// (node catalog + reference tables + the shape spec) is prompt-cached so
// repeat drafts in the same session are cheap.

export async function POST(req: NextRequest) {
  const settings = await readSettings();
  const provider = settings.aiProvider ?? "anthropic";

  let body: { scenario?: string; inputSchema?: unknown; contextSchema?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const scenario = (body.scenario ?? "").toString().trim();
  if (!scenario) {
    return NextResponse.json({ error: "Describe the scenario you want to build." }, { status: 400 });
  }

  if (provider !== "anthropic") {
    return NextResponse.json(
      { error: "AI drafting now runs on Claude. Open Settings → AI provider → Anthropic and paste your API key." },
      { status: 400 },
    );
  }
  const apiKey = settings.anthropicApiKey?.trim() || process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "No Anthropic API key set. Add it under Settings → AI provider → Anthropic (get one at console.anthropic.com)." },
      { status: 400 },
    );
  }
  const model = settings.anthropicModel?.trim() || "claude-opus-4-8";

  const root = await getActiveRoot();
  if (!root) return NextResponse.json({ error: "No workspace open." }, { status: 409 });

  let nodeDefs: NodeDef[] = [];
  let references: ReferenceSet[] = [];
  try {
    [nodeDefs, references] = await Promise.all([listNodeDefs(root), listReferences(root)]);
  } catch (err) {
    return NextResponse.json({ error: `Could not load workspace catalog: ${(err as Error).message}` }, { status: 500 });
  }

  const system = buildSystemPrompt(nodeDefs, references);
  const user = buildUserPrompt(scenario, body.inputSchema, body.contextSchema);

  const client = new Anthropic({ apiKey });
  let message: Anthropic.Message;
  try {
    // Stream + finalMessage server-side: robust against request timeouts when
    // adaptive thinking runs long. We don't forward the stream to the browser.
    message = await client.messages
      .stream({
        model,
        max_tokens: 20000,
        thinking: { type: "adaptive" },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
      })
      .finalMessage();
  } catch (err) {
    const e = err as { status?: number; message?: string };
    const status = e.status === 401 ? 401 : 502;
    const hint = e.status === 401 ? " (check the API key in Settings)" : "";
    return NextResponse.json({ error: `Claude request failed: ${e.message ?? "unknown error"}${hint}` }, { status });
  }

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const draft = parseDraft(text);
  if (!draft) {
    return NextResponse.json(
      { error: "Claude replied, but I couldn't parse a rule out of it. Try rephrasing the scenario.", raw: text.slice(0, 2000) },
      { status: 502 },
    );
  }

  return NextResponse.json({
    draft,
    model,
    rationale: draft.rationale ?? "",
    usage: {
      input: message.usage.input_tokens,
      output: message.usage.output_tokens,
      cacheRead: message.usage.cache_read_input_tokens ?? 0,
      cacheWrite: message.usage.cache_creation_input_tokens ?? 0,
    },
  });
}

// ---------------------------------------------------------------------------

function buildSystemPrompt(nodeDefs: NodeDef[], references: ReferenceSet[]): string {
  const catalog = nodeDefs.map(describeNode).join("\n");
  const refs = references.length ? references.map(describeRef).join("\n") : "(none)";

  return `You are RuleForge's rule-drafting assistant. RuleForge evaluates a request through a directed acyclic graph (DAG) of nodes and returns a decision/result. You turn a plain-language scenario into a draft rule the visual editor can load.

Output ONLY a single JSON object — no markdown fences, no prose before or after. Shape:
{
  "rationale": "one or two sentences explaining the rule you built",
  "instances": [ { "instanceId": "n1", "nodeId": "node-input", "label": "Request", "x": 80, "y": 240 } ],
  "edges": [ { "source": "n1", "target": "n2", "branch": "default" } ],
  "bindings": { "n2": { "bindings": { "<port>": <PortBinding> }, "extras": { "matchOn": {}, "fields": {} } } },
  "tests": [ { "name": "Happy path", "payload": {} } ]
}

Lay nodes out left-to-right: x increases by ~220 per step, y around 240 (fan parallel lookups to y 140 / 340).

PortBinding is one of:
- { "kind": "literal", "value": <any> }            // a fixed value (string/number/object)
- { "kind": "path", "path": "$.fieldName" }          // read a field from the incoming request
- { "kind": "reference", "referenceId": "ref-x" }    // ONLY for a lookup node's referenceId port

How to compose a rule (follow this house style):
1. Start with exactly ONE node-input and end with exactly ONE node-output. Wire everything in between with edges (branch "default" unless a node has pass/fail outputs).
2. Seed a working object with node-constant: bind its "value" port to a literal object holding every field you'll fill in (numbers default 0, strings "").
3. Copy request fields onto the object with node-mutator-map: put them in extras.fields, e.g. "fields": { "region": { "kind": "path", "path": "$.destinationRegion" } }.
4. Look values up from a reference table with node-mutator-lookup:
   bindings: target (literal = field to write), referenceId (kind reference), valueColumn (literal = column to read), onMissing (literal "leave").
   extras.matchOn maps each key column to its source: { "level": { "kind": "path", "path": "$.coverageLevel" } }.
   IMPORTANT: matchOn keys can only read from the REQUEST ($.x) — never from a computed field. Look up by raw request values; compute ranges with calc.
5. Compute values with node-calc: bind target (literal = field name) and expression (literal = an NCalc expression). Bare names in the expression resolve from the working object/request. Branch with if(cond, a, b). Examples: "if(maxAge <= 25, '18-25', '26+')", "Round(baseRate * days * (1 + loadingPct/100.0), 2)".
6. Filters (node-filter-*) and asserts have pass/fail outputs — use branch "pass"/"fail" on their edges. Use them to gate or reject.

Available node types:
${catalog}

Available reference tables (use exact ids + column names):
${refs}

Rules of thumb: prefer the simplest graph that works; reuse one node-mutator-map instead of many single Set nodes; only use a node type that appears in the catalog above; only reference a table id that appears above. Generate 2-4 varied test payloads that satisfy the request's input schema.`;
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
    : d.id === "node-mutator-set" ? "  [single field; prefer node-mutator-map for several]"
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

function buildUserPrompt(scenario: string, inputSchema: unknown, contextSchema: unknown): string {
  const parts = [`Scenario:\n${scenario}`];
  if (inputSchema && typeof inputSchema === "object" && Object.keys(inputSchema as object).length) {
    parts.push(`\nThe rule's request input schema (use these field names in $.paths and test payloads):\n${JSON.stringify(inputSchema, null, 2)}`);
  } else {
    parts.push(`\nNo input schema was provided — infer sensible request field names from the scenario and list them in your test payloads.`);
  }
  if (contextSchema && typeof contextSchema === "object" && Object.keys(contextSchema as object).length) {
    parts.push(`\nContext schema (read via $ctx.x):\n${JSON.stringify(contextSchema, null, 2)}`);
  }
  parts.push(`\nReturn the JSON rule now.`);
  return parts.join("\n");
}

type Draft = {
  rationale?: string;
  instances?: unknown[];
  edges?: unknown[];
  bindings?: Record<string, unknown>;
  tests?: unknown[];
};

function parseDraft(text: string): Draft | null {
  let s = text.trim();
  // Strip ```json ... ``` fences if the model added them despite instructions.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // Otherwise slice from the first { to the last } so stray prose can't break parse.
  if (!s.startsWith("{")) {
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
  }
  try {
    const parsed = JSON.parse(s) as Draft;
    if (!parsed || !Array.isArray(parsed.instances) || !Array.isArray(parsed.edges)) return null;
    return parsed;
  } catch {
    return null;
  }
}
