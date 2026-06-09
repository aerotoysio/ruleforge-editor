"use client";

import { useEffect, useState } from "react";
import { Play, X, Wand2, Loader2, Save, FlaskConical, ChevronRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useRuleStore } from "@/lib/store/rule-store";
import { useNodesStore } from "@/lib/store/nodes-store";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { emptyPayload } from "@/lib/schema/empty-payload";
import { slugify } from "@/lib/slug";
import type { Envelope, RuleTest, TraceEntry, TraceOutcome } from "@/lib/types";

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
  const [timing, setTiming] = useState<{
    mode: "http" | "cli";
    totalMs: number;
    stageMs: number;
    engineMs: number;
    fellBackFromHttp?: boolean;
  } | null>(null);

  // Drag-resizable dock height (px), persisted across sessions.
  const [height, setHeight] = useState(420);
  const [gripHover, setGripHover] = useState(false);

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
    setTiming(null);
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
        if (data.timing) setTiming(data.timing);
        return;
      }
      setEnvelope(data.envelope);
      setStderr(data.stderr ?? null);
      if (data.timing) setTiming(data.timing);
      applyTrace(data.envelope as Envelope, setTrace);
      const ms = data.timing?.totalMs ? ` · ${data.timing.totalMs}ms` : "";
      toast.success(`Decision: ${data.envelope?.decision ?? "?"}${ms}`);
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setEnvelope(null);
    setStderr(null);
    setTrace(null);
  }

  // ── Drag-to-resize the dock ────────────────────────────────────────────
  // Restore any saved height on mount; otherwise default to ~45% of viewport.
  useEffect(() => {
    const saved = Number(localStorage.getItem("rf-testpanel-h"));
    if (saved && saved > 120) setHeight(saved);
    else setHeight(Math.round(window.innerHeight * 0.45));
  }, []);
  useEffect(() => {
    if (height > 0) localStorage.setItem("rf-testpanel-h", String(height));
  }, [height]);

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    const onMove = (ev: MouseEvent) => {
      const maxH = window.innerHeight - 96; // leave the topbar reachable
      setHeight(Math.min(maxH, Math.max(140, startH - (ev.clientY - startY))));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
  }

  function resetHeight() {
    setHeight(Math.round(window.innerHeight * 0.45));
  }

  if (!open) return null;

  return (
    <div
      className="absolute left-0 right-0 bottom-0 flex flex-col"
      style={{
        height,
        background: "var(--color-bg)",
        borderTop: "1px solid var(--color-border-strong)",
        boxShadow: "0 -4px 16px rgba(0,0,0,0.04)",
      }}
    >
      {/* Drag-to-resize handle — straddles the top border. Double-click resets. */}
      <div
        onMouseDown={startResize}
        onDoubleClick={resetHeight}
        onMouseEnter={() => setGripHover(true)}
        onMouseLeave={() => setGripHover(false)}
        title="Drag to resize · double-click to reset"
        style={{
          position: "absolute",
          top: -5,
          left: 0,
          right: 0,
          height: 11,
          cursor: "ns-resize",
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: gripHover ? 64 : 46,
            height: 4,
            borderRadius: 999,
            background: gripHover ? "var(--color-fg-muted)" : "var(--color-border-strong)",
            transition: "background 120ms ease, width 120ms ease",
          }}
        />
      </div>
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
        {timing ? (
          <span
            className="status-badge"
            style={{
              marginLeft: 8,
              background:
                timing.mode === "http"
                  ? "var(--success-soft)"
                  : timing.fellBackFromHttp
                  ? "var(--warn-soft)"
                  : "var(--panel-2)",
              color:
                timing.mode === "http"
                  ? "var(--success)"
                  : timing.fellBackFromHttp
                  ? "var(--warn)"
                  : "var(--text-dim)",
              borderColor: "transparent",
            }}
            title={
              timing.mode === "http"
                ? `Engine HTTP — ~${timing.engineMs}ms engine + ${timing.stageMs}ms stage. Fast path active.`
                : timing.fellBackFromHttp
                ? `Engine URL is set but the HTTP engine didn't respond — fell back to CLI (~${timing.engineMs}ms). Start the engine server (see /commands) for ~25× speedup.`
                : `Engine CLI — dotnet startup costs ~${timing.engineMs - 1}ms. Set Engine URL in Settings to switch to HTTP mode (~25× faster).`
            }
          >
            <span
              className="dot"
              style={{
                background:
                  timing.mode === "http"
                    ? "var(--success)"
                    : timing.fellBackFromHttp
                    ? "var(--warn)"
                    : "var(--text-muted)",
              }}
            />
            {timing.mode === "http"
              ? "HTTP"
              : timing.fellBackFromHttp
              ? "CLI (HTTP unreachable)"
              : "CLI"} · {timing.totalMs}ms
          </span>
        ) : null}
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
      {envelope.trace?.length ? <TraceView entries={envelope.trace} /> : null}
    </div>
  );
}

/**
 * Trace view — one row per node-instance the engine executed, with the rich
 * data the engine ships (input / output / context reads / writes / error)
 * collapsed under a chevron. Click any row to expand and see what the node
 * actually emitted — this is what makes the "why didn't the response change
 * when I edited the request?" question answerable: you can SEE which node
 * read the field you tweaked and what it emitted downstream.
 *
 * The trace also implicitly tells you which branch fired — nodes that didn't
 * execute don't appear, so a filter's `fail` branch vs `pass` branch is
 * visible by which downstream constant ran.
 */
function TraceView({ entries }: { entries: TraceEntry[] }) {
  // Resolve instanceId → friendly label by walking the live rule. Labels are
  // way easier to scan than `n4` / `n5` ids.
  const rule = useRuleStore((s) => s.rule);
  const nodeDefs = useNodesStore((s) => s.nodes);
  const instanceById = new Map<string, { label: string; nodeId: string; category: string; accent: string; badge: string }>();
  if (rule) {
    for (const inst of rule.instances) {
      const def = nodeDefs.find((d) => d.id === inst.nodeId);
      instanceById.set(inst.instanceId, {
        label: inst.label ?? def?.name ?? inst.instanceId,
        nodeId: inst.nodeId,
        category: def?.category ?? "unknown",
        accent: def?.ui?.accent ?? "#64748b",
        badge: def?.ui?.badge ?? "?",
      });
    }
  }

  return (
    <div>
      <div
        className="text-[10px] uppercase tracking-wider mb-1"
        style={{ color: "var(--color-fg-dim)" }}
      >
        Trace ({entries.length})
      </div>
      <div className="flex flex-col" style={{ gap: 2 }}>
        {entries.map((t, i) => (
          <TraceRow key={i} entry={t} step={i + 1} instance={instanceById.get(t.nodeId)} />
        ))}
      </div>
    </div>
  );
}

function TraceRow({
  entry,
  step,
  instance,
}: {
  entry: TraceEntry;
  step: number;
  instance?: { label: string; nodeId: string; category: string; accent: string; badge: string };
}) {
  // Auto-expand error rows so they're visible without an extra click.
  const [open, setOpen] = useState<boolean>(entry.outcome === "error" || !!entry.error);
  const hasDetail =
    entry.input !== undefined
    || entry.output !== undefined
    || (entry.ctxRead && Object.keys(entry.ctxRead).length > 0)
    || (entry.ctxWritten && Object.keys(entry.ctxWritten).length > 0)
    || !!entry.error;

  return (
    <div
      style={{
        borderRadius: 6,
        background: entry.outcome === "error" ? "var(--danger-soft)" : "var(--panel-2)",
        border: "1px solid",
        borderColor: entry.outcome === "error" ? "var(--danger)" : "var(--border)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => hasDetail && setOpen(!open)}
        disabled={!hasDetail}
        style={{
          display: "grid",
          gridTemplateColumns: "20px 22px 22px 1fr auto auto",
          gap: 8,
          alignItems: "center",
          width: "100%",
          padding: "6px 10px",
          background: "transparent",
          border: 0,
          textAlign: "left",
          cursor: hasDetail ? "pointer" : "default",
        }}
      >
        <span style={{ color: "var(--text-faint)", fontSize: 10.5, fontVariantNumeric: "tabular-nums" }}>
          {step}
        </span>
        <span style={{ display: "inline-grid", placeItems: "center", color: "var(--text-muted)" }}>
          {hasDetail ? (
            open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
          ) : null}
        </span>
        <span
          style={{
            display: "inline-grid",
            placeItems: "center",
            width: 22, height: 18,
            borderRadius: 4,
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            background: instance?.accent ?? "var(--text-muted)",
            color: "#fff",
          }}
          title={instance ? `${instance.nodeId} (${instance.category})` : entry.nodeId}
        >
          {instance?.badge ?? "?"}
        </span>
        <span style={{ fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {instance?.label ?? entry.nodeId}
          <span className="mono" style={{ marginLeft: 6, fontSize: 10, color: "var(--text-faint)" }}>
            {entry.nodeId}
          </span>
        </span>
        <OutcomeBadge outcome={entry.outcome} />
        <span style={{ fontSize: 10.5, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
          {entry.durationMs} ms
        </span>
      </button>

      {open && hasDetail ? (
        <div style={{ borderTop: "1px solid var(--border)", padding: "8px 12px", background: "var(--panel)" }}>
          {entry.error ? (
            <DetailBlock label="Error" tone="danger">
              <pre className="mono" style={{ margin: 0, fontSize: 11, whiteSpace: "pre-wrap", color: "var(--danger)" }}>
                {entry.error}
              </pre>
            </DetailBlock>
          ) : null}
          {entry.input !== undefined ? (
            <DetailBlock label="Input">
              <JsonPreview value={entry.input} />
            </DetailBlock>
          ) : null}
          {entry.output !== undefined ? (
            <DetailBlock label="Output">
              <JsonPreview value={entry.output} />
            </DetailBlock>
          ) : null}
          {entry.ctxRead && Object.keys(entry.ctxRead).length > 0 ? (
            <DetailBlock label={`Context read (${Object.keys(entry.ctxRead).length})`}>
              <JsonPreview value={entry.ctxRead} />
            </DetailBlock>
          ) : null}
          {entry.ctxWritten && Object.keys(entry.ctxWritten).length > 0 ? (
            <DetailBlock label={`Context written (${Object.keys(entry.ctxWritten).length})`}>
              <JsonPreview value={entry.ctxWritten} />
            </DetailBlock>
          ) : null}
          {entry.subRuleRunId ? (
            <DetailBlock label="Sub-rule run id">
              <span className="mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>
                {entry.subRuleRunId}
              </span>
            </DetailBlock>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DetailBlock({ label, tone, children }: { label: string; tone?: "danger"; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div
        style={{
          fontSize: 9.5,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: tone === "danger" ? "var(--danger)" : "var(--text-muted)",
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function JsonPreview({ value }: { value: unknown }) {
  // Pretty-print at most ~400 chars inline — anything bigger gets a
  // collapsible. JSON bodies for non-leaf nodes can be the entire request.
  const json = JSON.stringify(value, null, 2);
  const trimmed = json.length > 800;
  return (
    <pre
      className="mono"
      style={{
        margin: 0,
        padding: "6px 8px",
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: 4,
        fontSize: 11,
        lineHeight: 1.45,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        maxHeight: trimmed ? 200 : "none",
        overflow: trimmed ? "auto" : "visible",
        color: "var(--text)",
      }}
    >
      {json}
    </pre>
  );
}

function OutcomeBadge({ outcome }: { outcome: TraceOutcome }) {
  const styles: Record<TraceOutcome, { bg: string; fg: string }> = {
    pass:  { bg: "var(--success-soft)", fg: "var(--success)" },
    fail:  { bg: "var(--danger-soft)",  fg: "var(--danger)" },
    skip:  { bg: "var(--panel-2)",      fg: "var(--text-muted)" },
    error: { bg: "var(--danger-soft)",  fg: "var(--danger)" },
  };
  const s = styles[outcome];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 16,
        padding: "0 6px",
        borderRadius: 8,
        background: s.bg,
        color: s.fg,
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
      }}
    >
      {outcome}
    </span>
  );
}

function OutcomeDot({ outcome }: { outcome: TraceOutcome }) {
  const c = outcome === "pass" ? "var(--color-pass)" : outcome === "fail" ? "var(--color-fail)" : outcome === "skip" ? "var(--color-skip)" : "var(--color-fail)";
  return <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: c }} />;
}
// Keep OutcomeDot exported in scope — Canvas / NodeView use it elsewhere
// via the rule store's `trace` overlay; not from this file directly.

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
