"use client";

import { useEffect, useState } from "react";
import { Play, X, Wand2, Loader2, Save, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { useRuleStore } from "@/lib/store/rule-store";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { emptyPayload } from "@/lib/schema/empty-payload";
import { slugify } from "@/lib/slug";
import type { Envelope, RuleTest, TraceOutcome } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
  prefill?: { payload: unknown; autoRun?: boolean; label?: string; key: string } | null;
};

export function TestPanel({ open, onClose, prefill }: Props) {
  const rule = useRuleStore((s) => s.rule);
  const upsertTest = useRuleStore((s) => s.upsertTest);
  const setTrace = useRuleStore((s) => s.setTrace);
  const [payload, setPayload] = useState("{}");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [envelope, setEnvelope] = useState<Envelope | null>(null);
  const [stderr, setStderr] = useState<string | null>(null);
  const [activeTestId, setActiveTestId] = useState<string>("");
  const [saveMode, setSaveMode] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [prefillBanner, setPrefillBanner] = useState<string | null>(null);

  // The dropdown reads the rule's per-rule tests directly — no API call.
  // This is the same store the Tests tab edits, so changes propagate live.
  const tests = rule?.tests ?? [];

  useEffect(() => {
    if (open && rule && payload === "{}") {
      setPayload(JSON.stringify(emptyPayload(rule.inputSchema), null, 2));
    }
  }, [open, rule, payload]);

  // Apply prefill (e.g. user clicked Run on a test in the Tests tab): populate payload, optionally auto-run.
  useEffect(() => {
    if (!open || !prefill || !rule) return;
    setPayload(JSON.stringify(prefill.payload, null, 2));
    setActiveTestId("");
    setError(null);
    setEnvelope(null);
    setStderr(null);
    setPrefillBanner(prefill.label ?? "Scenario loaded");
    if (prefill.autoRun) {
      // Defer run so state has flushed
      setTimeout(() => { void run(prefill.payload); }, 50);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.key, open, rule?.id]);

  function loadTest(id: string) {
    setActiveTestId(id);
    if (!id) return;
    const t = tests.find((x) => x.id === id);
    if (!t) return;
    setPayload(JSON.stringify(t.payload, null, 2));
    setError(null);
    setEnvelope(null);
    setStderr(null);
  }

  function autoGenerate() {
    if (!rule) return;
    setPayload(JSON.stringify(emptyPayload(rule.inputSchema), null, 2));
    setActiveTestId("");
    setError(null);
  }

  async function saveAsTest() {
    if (!rule) return;
    if (!saveName.trim()) {
      toast.error("Test name is required");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch (e) {
      toast.error("Payload isn't valid JSON: " + (e as Error).message);
      return;
    }
    const id = slugify(`${rule.id}-${saveName}`) || `test-${Date.now()}`;
    const test: RuleTest = {
      id,
      name: saveName.trim(),
      payload: parsed,
      updatedAt: new Date().toISOString(),
    };
    upsertTest(test);
    toast.success(`Saved test "${test.name}" — remember to Save the rule to persist to disk.`);
    setSaveMode(false);
    setSaveName("");
    setActiveTestId(id);
  }

  async function run(overridePayload?: unknown) {
    if (!rule) return;
    let parsed: unknown;
    if (overridePayload !== undefined) {
      parsed = overridePayload;
    } else {
      try {
        parsed = JSON.parse(payload);
      } catch (e) {
        setError((e as Error).message);
        return;
      }
    }
    setError(null);
    setBusy(true);
    setEnvelope(null);
    setStderr(null);
    try {
      const res = await fetch("/api/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ruleId: rule.id, payload: parsed }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Test failed");
        setStderr([data.error, data.stderr, data.stdout].filter(Boolean).join("\n\n"));
        return;
      }
      setEnvelope(data.envelope);
      setStderr(data.stderr ?? null);
      applyTrace(data.envelope as Envelope, setTrace);
      toast.success(`Decision: ${data.envelope?.decision ?? "?"}`);
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setEnvelope(null);
    setStderr(null);
    setTrace(null);
  }

  if (!open) return null;

  return (
    <div
      className="absolute left-0 right-0 bottom-0 flex flex-col"
      style={{
        height: "45%",
        background: "var(--color-bg)",
        borderTop: "1px solid var(--color-border-strong)",
        boxShadow: "0 -4px 16px rgba(0,0,0,0.04)",
      }}
    >
      <header
        className="px-4 h-10 shrink-0 flex items-center gap-3 border-b"
        style={{ background: "var(--color-bg-soft)" }}
      >
        <span className="text-[12.5px] font-medium">Test runner</span>
        <span className="text-[11px]" style={{ color: "var(--color-fg-muted)" }}>
          {rule?.method} <span className="mono">{rule?.endpoint}</span>
        </span>
        <div className="flex items-center gap-1.5 ml-3">
          <FlaskConical className="w-3.5 h-3.5" style={{ color: "var(--color-fg-muted)" }} />
          <Select
            value={activeTestId}
            onChange={(e) => loadTest(e.target.value)}
            style={{ width: 240, height: 28 }}
            title="Load a saved test scenario for this rule"
          >
            <option value="">{tests.length === 0 ? "— no tests yet —" : "— pick a test —"}</option>
            {tests.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" onClick={autoGenerate}>
            <Wand2 className="w-3.5 h-3.5" /> Auto from schema
          </Button>
          <Button size="sm" onClick={() => setSaveMode((v) => !v)}>
            <Save className="w-3.5 h-3.5" /> Save as…
          </Button>
          <Button size="sm" onClick={clear} disabled={!envelope}>Clear trace</Button>
          <Button size="sm" variant="default" onClick={() => run()} disabled={busy}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Run
          </Button>
          <button onClick={onClose} className="ml-1 w-6 h-6 inline-flex items-center justify-center rounded" style={{ color: "var(--color-fg-muted)" }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {prefillBanner ? (
        <div
          className="px-4 py-1.5 text-[11.5px] flex items-center gap-2 border-b shrink-0"
          style={{ background: "#fff7e0", color: "#8a5a00", borderColor: "#e7c87a" }}
        >
          <FlaskConical className="w-3.5 h-3.5" />
          <span>Loaded from Test page: <strong>{prefillBanner}</strong></span>
          <button
            onClick={() => setPrefillBanner(null)}
            className="ml-auto underline opacity-70 hover:opacity-100"
            style={{ color: "inherit" }}
          >
            dismiss
          </button>
        </div>
      ) : null}

      {saveMode ? (
        <div
          className="px-4 py-2 shrink-0 flex items-center gap-2 border-b"
          style={{ background: "var(--color-bg)" }}
        >
          <Input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Test name (e.g. Economy LHR-DXB 2 ADT)"
            className="flex-1"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") void saveAsTest(); if (e.key === "Escape") { setSaveMode(false); setSaveName(""); } }}
          />
          <Button size="sm" variant="default" onClick={saveAsTest} disabled={!saveName.trim()}>
            Save
          </Button>
          <Button size="sm" onClick={() => { setSaveMode(false); setSaveName(""); }}>
            Cancel
          </Button>
        </div>
      ) : null}

      <div className="flex-1 grid grid-cols-2 overflow-hidden">
        <div className="flex flex-col border-r" style={{ borderColor: "var(--color-border)" }}>
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider shrink-0" style={{ color: "var(--color-fg-dim)" }}>
            Request payload (JSON)
          </div>
          <textarea
            className="flex-1 mono text-[12px] p-3 resize-none outline-none"
            style={{ background: "var(--color-bg)", color: "var(--color-fg)" }}
            value={payload}
            onChange={(e) => { setPayload(e.target.value); setError(null); }}
          />
          {error ? <div className="px-3 py-1 text-[11px] shrink-0" style={{ color: "var(--color-fail)", background: "var(--color-bg-soft)" }}>{error}</div> : null}
        </div>
        <div className="flex flex-col">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider shrink-0" style={{ color: "var(--color-fg-dim)" }}>
            Envelope
          </div>
          <div className="flex-1 overflow-auto p-3">
            {envelope ? <EnvelopeView envelope={envelope} /> : <Empty msg="Click Run to evaluate this rule against the payload." />}
            {stderr ? (
              <details className="mt-3">
                <summary className="text-[11px] cursor-pointer" style={{ color: "var(--color-fg-muted)" }}>Engine stderr</summary>
                <pre className="mono text-[11px] mt-1 p-2 rounded" style={{ background: "var(--color-bg-soft)", color: "var(--color-fg-soft)" }}>{stderr}</pre>
              </details>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function EnvelopeView({ envelope }: { envelope: Envelope }) {
  const decision = envelope.decision;
  const decisionColor =
    decision === "apply" ? "var(--color-pass)"
    : decision === "skip" ? "var(--color-skip)"
    : "var(--color-fail)";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span
          className="px-1.5 h-5 inline-flex items-center text-[11px] font-medium rounded uppercase tracking-wider"
          style={{ background: decisionColor, color: "#fff" }}
        >
          {decision}
        </span>
        <span className="text-[11px]" style={{ color: "var(--color-fg-muted)" }}>
          {envelope.ruleId}@{envelope.ruleVersion}
        </span>
        {typeof envelope.durationMs === "number" ? (
          <span className="text-[11px]" style={{ color: "var(--color-fg-dim)" }}>
            {envelope.durationMs} ms
          </span>
        ) : null}
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--color-fg-dim)" }}>Result</div>
        <pre className="mono text-[11.5px] p-2 rounded whitespace-pre-wrap break-words" style={{ background: "var(--color-bg-soft)", border: "1px solid var(--color-border)" }}>
          {JSON.stringify(envelope.result ?? null, null, 2)}
        </pre>
      </div>
      {envelope.trace?.length ? (
        <div>
          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--color-fg-dim)" }}>Trace ({envelope.trace.length})</div>
          <div className="flex flex-col gap-1">
            {envelope.trace.map((t, i) => (
              <div key={i} className="grid grid-cols-[auto_1fr_auto] gap-2 items-center px-2 py-1 rounded" style={{ background: "var(--color-bg-soft)" }}>
                <OutcomeDot outcome={t.outcome} />
                <span className="mono text-[11px] truncate" title={t.nodeId}>{t.nodeId}</span>
                <span className="text-[10px]" style={{ color: "var(--color-fg-muted)" }}>{t.durationMs} ms</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OutcomeDot({ outcome }: { outcome: TraceOutcome }) {
  const c = outcome === "pass" ? "var(--color-pass)" : outcome === "fail" ? "var(--color-fail)" : outcome === "skip" ? "var(--color-skip)" : "var(--color-fail)";
  return <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: c }} />;
}

function Empty({ msg }: { msg: string }) {
  return <div className="text-[12px] py-6 text-center" style={{ color: "var(--color-fg-muted)" }}>{msg}</div>;
}

function applyTrace(envelope: Envelope, setTrace: (t: { nodeOutcomes: Record<string, TraceOutcome>; traversedEdges: Set<string> } | null) => void) {
  if (!envelope.trace) {
    setTrace(null);
    return;
  }
  const nodeOutcomes: Record<string, TraceOutcome> = {};
  const visited = new Set<string>();
  for (const t of envelope.trace) {
    nodeOutcomes[t.nodeId] = t.outcome;
    visited.add(t.nodeId);
  }
  const rule = useRuleStore.getState().rule;
  const traversedEdges = new Set<string>();
  if (rule) {
    for (const e of rule.edges) {
      if (visited.has(e.source) && visited.has(e.target)) {
        const sourceOutcome = nodeOutcomes[e.source];
        const branch = e.branch ?? "default";
        if (
          branch === "default" ||
          (branch === "pass" && sourceOutcome === "pass") ||
          (branch === "fail" && sourceOutcome === "fail")
        ) {
          traversedEdges.add(e.id);
        }
      }
    }
  }
  setTrace({ nodeOutcomes, traversedEdges });
}
