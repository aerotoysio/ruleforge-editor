"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Upload,
  Loader2,
  Wand2,
  Check,
  FileText,
  AlertTriangle,
  ExternalLink,
  X,
} from "lucide-react";
import type {
  JsonSchema,
  Rule,
  RuleNodeInstance,
  RuleEdge,
  EdgeBranch,
  NodeBindings,
  PortBinding,
  RuleTest,
  RuleAiMeta,
} from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { slugify } from "@/lib/slug";

const EMPTY_OBJECT_SCHEMA: JsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {},
  required: [],
};

type PolicyFile = { base64: string; mediaType: string; name: string };
type AuthorResponse = {
  draft: {
    inputSchema: JsonSchema;
    outputSchema: JsonSchema;
    contextSchema?: JsonSchema;
    instances: Array<{ instanceId?: string; nodeId?: string; label?: string; x?: number; y?: number }>;
    edges: Array<{ source?: string; target?: string; branch?: string }>;
    bindings: Record<string, { bindings?: Record<string, PortBinding>; extras?: Record<string, unknown> }>;
    tests: Array<{ name?: string; payload?: unknown }>;
  };
  aiMeta: RuleAiMeta;
  rationale?: string;
  validationError?: string | null;
  usage?: { input: number; output: number; cacheRead: number };
};

export function NewRuleClient() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // identity
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [idEdited, setIdEdited] = useState(false);
  const [endpoint, setEndpoint] = useState("");
  const [method, setMethod] = useState<"GET" | "POST">("POST");
  const [category, setCategory] = useState("");
  const [knownCategories, setKnownCategories] = useState<string[]>([]);

  // policy
  const [policyText, setPolicyText] = useState("");
  const [policyFile, setPolicyFile] = useState<PolicyFile | null>(null);

  // shape
  const [schemaMode, setSchemaMode] = useState<"ai" | "provided">("ai");
  const [providedInput, setProvidedInput] = useState("");
  const [providedOutput, setProvidedOutput] = useState("");

  // generation
  const [provider, setProvider] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [result, setResult] = useState<AuthorResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const computedId = useMemo(() => (idEdited ? id : slugify(name)), [name, id, idEdited]);
  const configured = provider === "anthropic" && hasKey;
  const hasPolicy = Boolean(policyText.trim() || policyFile);

  useEffect(() => {
    fetch("/api/rules")
      .then((r) => r.json())
      .then((d) => {
        const cats = [...new Set((d.rules ?? []).map((r: { category?: string }) => r.category).filter(Boolean))] as string[];
        setKnownCategories(cats.sort());
      })
      .catch(() => {});
    fetch("/api/ai/models")
      .then((r) => r.json())
      .then((d) => { setProvider(d.provider ?? null); setHasKey(Boolean(d.hasKey)); })
      .catch(() => {});
  }, []);

  function onFile(file: File | undefined) {
    if (!file) return;
    if (file.type === "application/pdf") {
      const reader = new FileReader();
      reader.onload = () => {
        const b64 = String(reader.result).split(",")[1] ?? "";
        setPolicyFile({ base64: b64, mediaType: "application/pdf", name: file.name });
        setPolicyText("");
      };
      reader.readAsDataURL(file);
    } else {
      // treat everything else as text (txt/md/json/csv/…)
      const reader = new FileReader();
      reader.onload = () => { setPolicyText(String(reader.result)); setPolicyFile(null); };
      reader.readAsText(file);
    }
  }

  async function generate() {
    if (!configured) return;
    let providedSchemas: AuthorResponse["draft"] | undefined;
    if (schemaMode === "provided") {
      try {
        providedSchemas = {
          inputSchema: providedInput.trim() ? JSON.parse(providedInput) : EMPTY_OBJECT_SCHEMA,
          outputSchema: providedOutput.trim() ? JSON.parse(providedOutput) : EMPTY_OBJECT_SCHEMA,
        } as unknown as AuthorResponse["draft"];
      } catch {
        setGenError("The provided schema isn't valid JSON. Fix it or switch to “Let Claude design”.");
        return;
      }
    }
    setGenerating(true);
    setGenError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ai/author", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          policy: policyFile ? { file: policyFile } : { text: policyText },
          schemaMode,
          providedSchemas:
            schemaMode === "provided"
              ? { inputSchema: (providedSchemas as unknown as { inputSchema: JsonSchema }).inputSchema, outputSchema: (providedSchemas as unknown as { outputSchema: JsonSchema }).outputSchema }
              : undefined,
          identity: { name: name.trim(), id: computedId, endpoint: endpoint.trim(), category: category.trim() },
        }),
      });
      const data = await res.json();
      if (!res.ok) { setGenError(data.error ?? "Generation failed."); return; }
      setResult(data as AuthorResponse);
    } catch (e) {
      setGenError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function createRule(fromDraft: boolean) {
    if (!name.trim() || !computedId.trim() || !endpoint.trim()) {
      toast.error("Name and endpoint are required");
      return;
    }
    const base = {
      id: computedId,
      name: name.trim(),
      description: undefined as string | undefined,
      category: category.trim() || undefined,
      endpoint: endpoint.trim(),
      method,
      status: "draft" as const,
      currentVersion: 1,
      updatedAt: new Date().toISOString(),
    };

    let rule: Rule;
    if (fromDraft && result) {
      const d = result.draft;
      const instances = toInstances(d.instances);
      rule = {
        ...base,
        inputSchema: d.inputSchema ?? EMPTY_OBJECT_SCHEMA,
        outputSchema: d.outputSchema ?? EMPTY_OBJECT_SCHEMA,
        contextSchema: d.contextSchema ?? EMPTY_OBJECT_SCHEMA,
        instances,
        edges: toEdges(d.edges, instances),
        bindings: toBindings(d.bindings, instances, base.id),
        tests: toTests(d.tests),
        aiMeta: { ...result.aiMeta, generatedAt: new Date().toISOString() },
      };
    } else {
      rule = {
        ...base,
        inputSchema: EMPTY_OBJECT_SCHEMA,
        outputSchema: EMPTY_OBJECT_SCHEMA,
        contextSchema: EMPTY_OBJECT_SCHEMA,
        instances: [
          { instanceId: "n-input", nodeId: "node-input", position: { x: 80, y: 240 }, label: "Start" },
          { instanceId: "n-output", nodeId: "node-output", position: { x: 720, y: 240 }, label: "End" },
        ],
        edges: [{ id: "e-1", source: "n-input", target: "n-output", branch: "default" }],
        bindings: {},
        tests: [],
      };
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/rules/${encodeURIComponent(rule.id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(rule),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to create rule");
        return;
      }
      toast.success(fromDraft ? "Rule drafted — review it in the editor" : "Blank rule created");
      router.push(`/rules/${encodeURIComponent(rule.id)}`);
    } finally {
      setBusy(false);
    }
  }

  const canNext1 = name.trim() && computedId.trim() && endpoint.trim() && hasPolicy;

  return (
    <>
      <PageHeader
        title="New rule"
        eyebrow="Rules"
        description="Describe or upload a policy — Claude drafts the schemas, the rule graph, plain-English explanations, and test scenarios for you to review."
      />
      <div className="flex-1 overflow-auto" style={{ background: "var(--bg)" }}>
        <div className="max-w-2xl mx-auto px-8 py-8 flex flex-col gap-5">
          <Stepper step={step} />

          {step === 1 ? (
            <Card>
              <FieldRow label="Name" hint="Shows in lists and the editor toolbar.">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Travel insurance pricing" autoFocus />
              </FieldRow>
              <div className="grid grid-cols-[1fr_1fr] gap-3">
                <FieldRow label="ID" hint="URL-safe slug.">
                  <input className="input mono" style={{ fontFamily: "var(--font-mono)" }} value={idEdited ? id : computedId} onChange={(e) => { setId(e.target.value); setIdEdited(true); }} placeholder="travel-insurance" />
                </FieldRow>
                <FieldRow label="Category" hint="Groups it in the rules tree.">
                  <input className="input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Insurance" list="rule-categories" />
                  <datalist id="rule-categories">{knownCategories.map((c) => <option key={c} value={c} />)}</datalist>
                </FieldRow>
              </div>
              <div className="grid grid-cols-[100px_1fr] gap-3">
                <FieldRow label="Method">
                  <select className="input" value={method} onChange={(e) => setMethod(e.target.value as "GET" | "POST")}>
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                  </select>
                </FieldRow>
                <FieldRow label="Endpoint" hint="Path the engine exposes.">
                  <input className="input mono" style={{ fontFamily: "var(--font-mono)" }} value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="/v1/insurance/quote" />
                </FieldRow>
              </div>

              <FieldRow label="Policy" hint="Paste the rules/policy text, or upload a file (PDF or text).">
                <textarea
                  className="input"
                  value={policyText}
                  onChange={(e) => { setPolicyText(e.target.value); if (policyFile) setPolicyFile(null); }}
                  placeholder="e.g. Travel insurance is priced from a base daily rate per region and cover level, multiplied by trip length and number of travellers, with an age loading: 18–25 +10%, 66–79 +55%, 80+ +100%…"
                  rows={7}
                  style={{ resize: "vertical", minHeight: 130, lineHeight: 1.5 }}
                  disabled={!!policyFile}
                />
                <div className="flex items-center gap-2" style={{ marginTop: 6 }}>
                  <input ref={fileRef} type="file" accept=".pdf,.txt,.md,.json,.csv,application/pdf,text/*" style={{ display: "none" }} onChange={(e) => onFile(e.target.files?.[0])} />
                  <button type="button" className="btn ghost sm" onClick={() => fileRef.current?.click()}>
                    <Upload className="w-3.5 h-3.5" /> Upload file
                  </button>
                  {policyFile ? (
                    <span className="flex items-center gap-1.5" style={{ fontSize: 12, color: "var(--text)" }}>
                      <FileText className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} /> {policyFile.name}
                      <button type="button" className="icon-btn" style={{ width: 20, height: 20 }} onClick={() => setPolicyFile(null)} aria-label="Remove file"><X className="w-3 h-3" /></button>
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>PDF read natively · text files inlined</span>
                  )}
                </div>
              </FieldRow>

              <Footer>
                <Link href="/rules"><button className="btn ghost sm" disabled={busy}>Cancel</button></Link>
                <button className="btn primary sm" onClick={() => setStep(2)} disabled={!canNext1}>
                  Next: shape <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </Footer>
            </Card>
          ) : null}

          {step === 2 ? (
            <Card>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Input &amp; output shape</div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 4px", lineHeight: 1.5 }}>
                Claude can design the request/response schemas from your policy, or you can provide them. Either way they&apos;re fully editable later in the Schema tab.
              </p>
              <div className="flex flex-col gap-2">
                {(["ai", "provided"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSchemaMode(m)}
                    className="text-left transition-colors"
                    style={{
                      display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px",
                      border: `1px solid ${schemaMode === m ? "var(--accent)" : "var(--border)"}`,
                      background: schemaMode === m ? "var(--accent-soft)" : "var(--panel)",
                      borderRadius: 8, cursor: "pointer",
                    }}
                  >
                    {m === "ai" ? <Sparkles className="w-4 h-4 shrink-0" style={{ color: "var(--accent)", marginTop: 1 }} /> : <FileText className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)", marginTop: 1 }} />}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                        {m === "ai" ? "Let Claude design the input & output" : "I'll provide them"}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 1 }}>
                        {m === "ai" ? "Recommended — infers the request and response fields from the policy." : "Paste JSON Schema for the request and response."}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {schemaMode === "provided" ? (
                <div className="grid grid-cols-2 gap-3" style={{ marginTop: 2 }}>
                  <FieldRow label="Input schema (JSON)">
                    <textarea className="input mono" value={providedInput} onChange={(e) => setProvidedInput(e.target.value)} rows={7} placeholder='{ "type": "object", "properties": { "age": { "type": "integer" } } }' style={{ resize: "vertical", fontFamily: "var(--font-mono)", fontSize: 11.5 }} />
                  </FieldRow>
                  <FieldRow label="Output schema (JSON)">
                    <textarea className="input mono" value={providedOutput} onChange={(e) => setProvidedOutput(e.target.value)} rows={7} placeholder='{ "type": "object", "properties": { "premium": { "type": "number" } } }' style={{ resize: "vertical", fontFamily: "var(--font-mono)", fontSize: 11.5 }} />
                  </FieldRow>
                </div>
              ) : null}

              <Footer>
                <button className="btn ghost sm" onClick={() => setStep(1)} disabled={busy}><ArrowLeft className="w-3.5 h-3.5" /> Back</button>
                <button className="btn primary sm" onClick={() => setStep(3)}>Next: generate <ArrowRight className="w-3.5 h-3.5" /></button>
              </Footer>
            </Card>
          ) : null}

          {step === 3 ? (
            <Card>
              {!configured ? (
                <div className="flex items-center gap-2" style={{ fontSize: 12, color: "var(--warn)", background: "var(--warn-soft)", border: "1px solid var(--warn)", borderRadius: 8, padding: "10px 12px" }}>
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span style={{ flex: 1 }}>Claude isn&apos;t configured yet.</span>
                  <Link href="/settings" className="inline-flex items-center gap-1" style={{ color: "var(--accent)", fontWeight: 500 }}>Add API key <ExternalLink className="w-3 h-3" /></Link>
                </div>
              ) : null}

              {!result ? (
                <div className="flex flex-col items-center gap-3" style={{ padding: "20px 0", textAlign: "center" }}>
                  <Sparkles className="w-7 h-7" style={{ color: "var(--accent)" }} />
                  <div style={{ fontSize: 13, color: "var(--text)", maxWidth: 380, lineHeight: 1.5 }}>
                    Claude will read the policy and draft the schemas, the rule graph, per-node explanations, citations, and test scenarios. You review everything before it&apos;s saved.
                  </div>
                  <button className="btn primary" onClick={generate} disabled={generating || !configured}>
                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    {generating ? "Drafting the rule…" : "Generate with Claude"}
                  </button>
                  {generating ? <span style={{ fontSize: 11, color: "var(--text-muted)" }}>This can take 10–30s for a detailed policy.</span> : null}
                  {genError ? (
                    <div style={{ fontSize: 12, color: "var(--danger)", background: "var(--danger-soft)", border: "1px solid var(--danger)", borderRadius: 8, padding: "8px 10px", maxWidth: 420, lineHeight: 1.45 }}>{genError}</div>
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4" style={{ color: "var(--success)" }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Draft ready</span>
                    <span className="mono" style={{ fontSize: 10.5, color: "var(--text-muted)", marginLeft: "auto" }}>
                      {result.draft.instances.length} nodes · {result.draft.edges.length} edges · {result.draft.tests.length} tests
                    </span>
                  </div>
                  {result.aiMeta?.narrative ? (
                    <div style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.55, background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", maxHeight: 200, overflow: "auto" }}>
                      {result.aiMeta.narrative}
                    </div>
                  ) : null}
                  <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    input: {schemaFieldCount(result.draft.inputSchema)} fields · output: {schemaFieldCount(result.draft.outputSchema)} fields
                  </div>
                  {result.validationError ? (
                    <div className="flex items-start gap-2" style={{ fontSize: 12, color: "var(--warn)", background: "var(--warn-soft)", border: "1px solid var(--warn)", borderRadius: 8, padding: "8px 10px", lineHeight: 1.45 }}>
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" style={{ marginTop: 1 }} />
                      <span>Draft has a validation issue you can fix in the editor: <span className="mono">{result.validationError}</span></span>
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <button className="btn primary sm" onClick={() => createRule(true)} disabled={busy}>
                      <Check className="w-3.5 h-3.5" /> Create &amp; review in editor
                    </button>
                    <button className="btn ghost sm" onClick={generate} disabled={generating}>
                      {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} Regenerate
                    </button>
                  </div>
                </div>
              )}

              <Footer>
                <button className="btn ghost sm" onClick={() => setStep(2)} disabled={busy || generating}><ArrowLeft className="w-3.5 h-3.5" /> Back</button>
                <button className="btn ghost sm" onClick={() => createRule(false)} disabled={busy} title="Skip AI and start from a blank Input → Output graph">
                  Start blank instead
                </button>
              </Footer>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

// --- draft → rule-shape converters (shared with the AI-draft bar logic) ----

function toInstances(raw: AuthorResponse["draft"]["instances"]): RuleNodeInstance[] {
  return (raw ?? [])
    .filter((i) => i?.instanceId && i?.nodeId)
    .map((i) => ({ instanceId: i.instanceId as string, nodeId: i.nodeId as string, position: { x: Number(i.x ?? 0), y: Number(i.y ?? 0) }, label: i.label }));
}
function toEdges(raw: AuthorResponse["draft"]["edges"], instances: RuleNodeInstance[]): RuleEdge[] {
  const ids = new Set(instances.map((i) => i.instanceId));
  return (raw ?? [])
    .filter((e) => e?.source && e?.target && ids.has(e.source as string) && ids.has(e.target as string))
    .map((e, i) => ({ id: `e-${i + 1}`, source: e.source as string, target: e.target as string, branch: ((e.branch as EdgeBranch) ?? "default") as EdgeBranch }));
}
function toBindings(raw: AuthorResponse["draft"]["bindings"], instances: RuleNodeInstance[], ruleId: string): Record<string, NodeBindings> {
  const ids = new Set(instances.map((i) => i.instanceId));
  const out: Record<string, NodeBindings> = {};
  for (const [iid, nb] of Object.entries(raw ?? {})) {
    if (!ids.has(iid)) continue;
    out[iid] = { instanceId: iid, ruleId, bindings: (nb?.bindings ?? {}) as Record<string, PortBinding>, ...(nb?.extras && typeof nb.extras === "object" ? { extras: nb.extras } : {}) };
  }
  return out;
}
function toTests(raw: AuthorResponse["draft"]["tests"]): RuleTest[] {
  return (raw ?? [])
    .filter((t) => t?.payload && typeof t.payload === "object")
    .map((t, i) => ({ id: `t-${i + 1}`, name: t.name ?? `Scenario ${i + 1}`, payload: t.payload as Record<string, unknown> }));
}
function schemaFieldCount(s: JsonSchema | undefined): number {
  const props = (s as { properties?: Record<string, unknown> } | undefined)?.properties;
  return props ? Object.keys(props).length : 0;
}

// --- presentational bits ---------------------------------------------------

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const steps = ["Describe", "Shape", "Generate"];
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const active = n === step;
        const done = n < step;
        return (
          <div key={label} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5" style={{ opacity: active || done ? 1 : 0.5 }}>
              <span
                className="inline-flex items-center justify-center"
                style={{ width: 20, height: 20, borderRadius: "50%", fontSize: 11, fontWeight: 600, background: active ? "var(--accent)" : done ? "var(--success)" : "var(--panel-2)", color: active || done ? "#fff" : "var(--text-muted)" }}
              >
                {done ? <Check className="w-3 h-3" /> : n}
              </span>
              <span style={{ fontSize: 12, fontWeight: active ? 600 : 500, color: active ? "var(--text)" : "var(--text-muted)" }}>{label}</span>
            </div>
            {i < steps.length - 1 ? <div style={{ width: 24, height: 1, background: "var(--border)" }} /> : null}
          </div>
        );
      })}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4" style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)", padding: 22 }}>
      {children}
    </div>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-between items-center gap-2" style={{ paddingTop: 12, borderTop: "1px solid var(--border)" }}>{children}</div>;
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="flex items-baseline justify-between gap-2">
        <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>{label}</label>
        {hint ? <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}
