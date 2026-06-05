"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, X, Loader2, Wand2, Check, Trash2, ExternalLink } from "lucide-react";
import { nanoid } from "nanoid";
import { useRuleStore } from "@/lib/store/rule-store";
import type { RuleNodeInstance, RuleEdge, EdgeBranch, NodeBindings, RuleTest, PortBinding } from "@/lib/types";

// A top overlay bar: describe a scenario in plain English, Claude drafts a rule
// (nodes + edges + bindings) plus test scenarios, and you apply it to the canvas.
// Talks to /api/ai/draft (Anthropic provider). Settings → AI provider holds the key.

type DraftResult = {
  rationale?: string;
  instances?: Array<{ instanceId?: string; nodeId?: string; label?: string; x?: number; y?: number }>;
  edges?: Array<{ source?: string; target?: string; branch?: string }>;
  bindings?: Record<string, { bindings?: Record<string, PortBinding>; extras?: Record<string, unknown> }>;
  tests?: Array<{ name?: string; payload?: unknown }>;
};

type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };

export function AiDraftBar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const rule = useRuleStore((s) => s.rule);
  const patchRule = useRuleStore((s) => s.patchRule);

  const [scenario, setScenario] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [meta, setMeta] = useState<{ model?: string; usage?: Usage } | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    taRef.current?.focus();
    fetch("/api/ai/models")
      .then((r) => r.json())
      .then((d) => { setProvider(d.provider ?? null); setHasKey(Boolean(d.hasKey)); })
      .catch(() => {});
  }, [open]);

  if (!open || !rule) return null;

  const configured = provider === "anthropic" && hasKey;

  async function runDraft() {
    const s = scenario.trim();
    if (!s || !rule) return;
    setLoading(true);
    setError(null);
    setDraft(null);
    setMeta(null);
    try {
      const res = await fetch("/api/ai/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario: s, inputSchema: rule.inputSchema, contextSchema: rule.contextSchema }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Draft failed.");
        return;
      }
      setDraft((data.draft ?? null) as DraftResult);
      setMeta({ model: data.model, usage: data.usage });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function applyDraft() {
    if (!draft || !rule) return;
    const instances: RuleNodeInstance[] = (draft.instances ?? [])
      .filter((i) => i?.instanceId && i?.nodeId)
      .map((i) => ({
        instanceId: i.instanceId as string,
        nodeId: i.nodeId as string,
        position: { x: Number(i.x ?? 0), y: Number(i.y ?? 0) },
        label: i.label,
      }));
    const ids = new Set(instances.map((i) => i.instanceId));

    const edges: RuleEdge[] = (draft.edges ?? [])
      .filter((e) => e?.source && e?.target && ids.has(e.source as string) && ids.has(e.target as string))
      .map((e) => ({
        id: `e-${nanoid(8)}`,
        source: e.source as string,
        target: e.target as string,
        branch: ((e.branch as EdgeBranch) ?? "default") as EdgeBranch,
      }));

    const bindings: Record<string, NodeBindings> = {};
    for (const [iid, nb] of Object.entries(draft.bindings ?? {})) {
      if (!ids.has(iid)) continue;
      bindings[iid] = {
        instanceId: iid,
        ruleId: rule.id,
        bindings: (nb?.bindings ?? {}) as Record<string, PortBinding>,
        ...(nb?.extras && typeof nb.extras === "object" ? { extras: nb.extras } : {}),
      };
    }

    const tests: RuleTest[] = (draft.tests ?? [])
      .filter((t) => t?.payload && typeof t.payload === "object")
      .map((t) => ({ id: `t-${nanoid(6)}`, name: t.name ?? "Scenario", payload: t.payload as Record<string, unknown> }));

    if (instances.length === 0) {
      setError("The draft had no usable nodes — try rephrasing.");
      return;
    }
    if (rule.instances.length > 2 &&
      !confirm(`Replace the current ${rule.instances.length}-node canvas with the AI draft (${instances.length} nodes)? This can't be undone.`)) {
      return;
    }
    patchRule({ instances, edges, bindings, tests: tests.length ? tests : rule.tests });
    setDraft(null);
    setMeta(null);
    setScenario("");
    onClose();
  }

  const counts = draft
    ? { n: (draft.instances ?? []).length, e: (draft.edges ?? []).length, t: (draft.tests ?? []).length }
    : null;

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-30"
      style={{ top: 12, width: "min(700px, calc(100% - 32px))" }}
    >
      <div
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border-strong)",
          borderRadius: 12,
          boxShadow: "var(--shadow-md)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2"
          style={{ padding: "9px 12px", borderBottom: "1px solid var(--border)", background: "var(--panel-2)" }}
        >
          <Sparkles className="w-4 h-4" style={{ color: "var(--accent)" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Draft a rule with Claude</span>
          {provider ? (
            <span
              className="mono"
              style={{
                fontSize: 10,
                padding: "1px 7px",
                borderRadius: 999,
                background: configured ? "var(--accent-soft)" : "var(--warn-soft)",
                color: configured ? "var(--accent)" : "var(--warn)",
              }}
              title={configured ? "Anthropic provider configured" : "Set the Anthropic key in Settings"}
            >
              {configured ? "Anthropic ✓" : provider === "anthropic" ? "no key" : `provider: ${provider}`}
            </span>
          ) : null}
          <button onClick={onClose} className="icon-btn ml-auto" style={{ width: 26, height: 26 }} aria-label="Close">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <textarea
            ref={taRef}
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void runDraft(); }
            }}
            placeholder="Describe the rule in plain English — e.g. “Quote travel insurance priced by traveller age band, destination region and cover level, then convert the premium to the buyer's local currency.”  (⌘/Ctrl+Enter to draft)"
            rows={3}
            className="input"
            style={{ resize: "vertical", minHeight: 64, fontFamily: "inherit", lineHeight: 1.45 }}
          />

          {!configured ? (
            <div className="flex items-center gap-1.5" style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
              <span>AI drafting runs on Claude.</span>
              <Link href="/settings" className="inline-flex items-center gap-1" style={{ color: "var(--accent)" }}>
                Set provider → Anthropic + API key <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <button
              className="btn primary sm"
              onClick={() => void runDraft()}
              disabled={loading || !scenario.trim()}
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
              {loading ? "Drafting…" : "Draft"}
            </button>
            {meta?.model ? (
              <span className="mono" style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
                via {meta.model}
                {meta.usage ? ` · ${meta.usage.input}→${meta.usage.output} tok${meta.usage.cacheRead ? ` · ${meta.usage.cacheRead} cached` : ""}` : ""}
              </span>
            ) : null}
          </div>

          {error ? (
            <div
              style={{
                fontSize: 12,
                color: "var(--danger)",
                background: "var(--danger-soft)",
                border: "1px solid var(--danger)",
                borderRadius: 8,
                padding: "8px 10px",
                lineHeight: 1.45,
              }}
            >
              {error}
            </div>
          ) : null}

          {draft && counts ? (
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "var(--panel-2)",
                padding: "10px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {draft.rationale ? (
                <div style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.5 }}>{draft.rationale}</div>
              ) : null}
              <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {counts.n} {counts.n === 1 ? "node" : "nodes"} · {counts.e} {counts.e === 1 ? "edge" : "edges"} · {counts.t} test{counts.t === 1 ? "" : "s"}
              </div>
              <div className="flex items-center gap-2">
                <button className="btn primary sm" onClick={applyDraft}>
                  <Check className="w-3.5 h-3.5" /> Apply to canvas
                </button>
                <button className="btn ghost sm" onClick={() => { setDraft(null); setMeta(null); }}>
                  <Trash2 className="w-3.5 h-3.5" /> Discard
                </button>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  Review the nodes after applying — then Test &amp; Save.
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
