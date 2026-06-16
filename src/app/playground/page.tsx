"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// ─── The RuleForge Engine Playground ────────────────────────────────────────
// Pick any rule, edit the payload, Run. The point of the page: show the engine's
// OWN compute time (envelope.durationMicros — pure DAG evaluation, measured
// inside the engine) next to the client-measured round-trip, so you can see the
// engine is a sub-millisecond sliver and everything else is network / harness.

type RuleSummary = {
  id: string;
  name: string;
  endpoint?: string;
  method?: string;
  status?: string;
  category?: string;
};

type TraceEntry = { nodeId: string; durationMs: number; outcome: string };

type Envelope = {
  ruleId: string;
  decision: string;
  result?: unknown;
  durationMicros?: number;
  durationMs?: number;
  trace?: TraceEntry[];
};

type Timing = { mode: string; totalMs: number; stageMs: number; engineMs: number; fellBackFromHttp?: boolean };

type RunResult = { envelope?: Envelope; timing?: Timing; roundTripMs: number; error?: string };

function fmtMicros(us: number): string {
  if (us < 1) return `${(us * 1000).toFixed(0)} ns`;
  if (us < 1000) return `${us.toFixed(us < 10 ? 1 : 0)} µs`;
  return `${(us / 1000).toFixed(2)} ms`;
}
function fmtMs(ms: number): string {
  if (ms < 10) return `${ms.toFixed(1)} ms`;
  return `${Math.round(ms)} ms`;
}
function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx];
}

export default function PlaygroundPage() {
  const [rules, setRules] = useState<RuleSummary[]>([]);
  const [ruleId, setRuleId] = useState("");
  const [payload, setPayload] = useState("{}");
  const [defaultPayload, setDefaultPayload] = useState("{}");
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<RunResult | null>(null);
  const [bench, setBench] = useState<{ n: number; samples: number[]; running: boolean; progress: number } | null>(null);
  const [showResult, setShowResult] = useState(true);
  const [showTrace, setShowTrace] = useState(false);

  const selectRule = useCallback(async (id: string) => {
    setRuleId(id);
    setRun(null);
    setBench(null);
    try {
      const r = await fetch(`/api/rules/${id}`).then((x) => x.json());
      const rule = r.rule ?? r;
      const tp = rule?.tests?.[0]?.payload;
      const p = tp ? JSON.stringify(tp, null, 2) : "{}";
      setPayload(p);
      setDefaultPayload(p);
    } catch {
      setPayload("{}");
      setDefaultPayload("{}");
    }
  }, []);

  useEffect(() => {
    fetch("/api/rules")
      .then((r) => r.json())
      .then((d) => {
        const rs: RuleSummary[] = d.rules ?? [];
        setRules(rs);
        if (rs[0]) selectRule(rs[0].id);
      })
      .catch(() => {});
  }, [selectRule]);

  const callOnce = useCallback(async (): Promise<RunResult> => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload || "{}");
    } catch (e) {
      return { roundTripMs: 0, error: "Payload is not valid JSON — " + (e as Error).message };
    }
    const t0 = performance.now();
    let res: Response;
    try {
      res = await fetch("/api/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ruleId, payload: parsed }),
      });
    } catch (e) {
      return { roundTripMs: performance.now() - t0, error: (e as Error).message };
    }
    const t1 = performance.now();
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { roundTripMs: t1 - t0, error: data.detail || data.error || `HTTP ${res.status}` };
    return { envelope: data.envelope, timing: data.timing, roundTripMs: t1 - t0 };
  }, [payload, ruleId]);

  async function onRun() {
    setRunning(true);
    setBench(null);
    const r = await callOnce();
    setRun(r);
    setRunning(false);
  }

  async function onBench(n = 25) {
    setBench({ n, samples: [], running: true, progress: 0 });
    const samples: number[] = [];
    for (let i = 0; i < n; i++) {
      const r = await callOnce();
      if (i === 0) setRun(r);
      const us = r.envelope?.durationMicros;
      if (typeof us === "number") samples.push(us);
      setBench({ n, samples: [...samples], running: true, progress: i + 1 });
    }
    setBench({ n, samples, running: false, progress: n });
  }

  function onReset() {
    setPayload(defaultPayload);
    setRun(null);
    setBench(null);
    // Best-effort: ask a running HTTP engine to reload its rules. No-op (409) in
    // CLI mode — harmless.
    fetch("/api/engine/reload", { method: "POST" }).catch(() => {});
  }

  const engineUs = run?.envelope?.durationMicros;
  const engineMs = typeof engineUs === "number" ? engineUs / 1000 : undefined;
  const roundTrip = run?.roundTripMs ?? 0;
  // The loopback HTTP call to the engine (network + JSON serialization), EXCLUDING
  // the editor's compile/stage step — the honest "network" baseline. Falls back to
  // the client round-trip in CLI mode (no per-step timing).
  const networkMs = run?.timing?.engineMs ?? roundTrip;
  const stageMs = run?.timing?.stageMs;
  const enginePctOfNetwork = engineMs && networkMs > 0 ? (engineMs / networkMs) * 100 : 0;

  const benchStats = useMemo(() => {
    if (!bench || bench.samples.length === 0) return null;
    const sorted = [...bench.samples].sort((a, b) => a - b);
    return {
      count: sorted.length,
      min: sorted[0],
      p50: pct(sorted, 0.5),
      p95: pct(sorted, 0.95),
      max: sorted[sorted.length - 1],
    };
  }, [bench]);

  const selectedRule = rules.find((r) => r.id === ruleId);
  const decision = run?.envelope?.decision;
  const decisionColor =
    decision === "apply" ? "#16a34a" : decision === "skip" ? "#a16207" : decision === "error" ? "#dc2626" : "#71717a";

  return (
    <div style={{ maxWidth: 940, margin: "0 auto", padding: "32px 24px 80px", fontFamily: "var(--font-sans, system-ui)" }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>Engine Playground</h1>
        <p style={{ color: "var(--text-muted, #71717a)", marginTop: 6, fontSize: 14 }}>
          Run any rule against a payload and watch the engine&rsquo;s <strong>own compute time</strong> — the pure rule
          evaluation, measured inside the engine, with no network or serialization in the number.
        </p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
        {/* ─── Controls ─── */}
        <section style={card}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ flex: "1 1 280px", minWidth: 220 }}>
              <span style={labelStyle}>Rule</span>
              <select className="input" value={ruleId} onChange={(e) => selectRule(e.target.value)} style={{ width: "100%" }}>
                {rules.length === 0 ? <option>Loading…</option> : null}
                {rules.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} {r.endpoint ? `· ${r.method ?? "POST"} ${r.endpoint}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ marginTop: 14 }}>
            <span style={labelStyle}>Payload (JSON)</span>
            <textarea
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              spellCheck={false}
              style={{
                width: "100%",
                minHeight: 160,
                fontFamily: "var(--font-mono, ui-monospace, monospace)",
                fontSize: 12.5,
                lineHeight: 1.5,
                padding: 12,
                borderRadius: 8,
                border: "1px solid var(--border, #e4e4e7)",
                background: "var(--surface, #fff)",
                color: "var(--text, #18181b)",
                resize: "vertical",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" onClick={onRun} disabled={running || !ruleId} style={primaryBtn(running)}>
              {running ? "Running…" : "▶ Run"}
            </button>
            <button type="button" onClick={() => onBench(25)} disabled={running || (bench?.running ?? false) || !ruleId} style={ghostBtn}>
              {bench?.running ? `Benchmarking ${bench.progress}/${bench.n}…` : "Run 25× (benchmark)"}
            </button>
            <button type="button" onClick={onReset} disabled={running} style={ghostBtn}>
              ↺ Reset
            </button>
            <span style={{ color: "var(--text-muted, #a1a1aa)", fontSize: 12, marginLeft: "auto" }}>
              {selectedRule?.endpoint ? `${selectedRule.method ?? "POST"} ${selectedRule.endpoint}` : ""}
            </span>
          </div>
        </section>

        {/* ─── Error ─── */}
        {run?.error ? (
          <section style={{ ...card, borderColor: "#fca5a5", background: "#fef2f2" }}>
            <strong style={{ color: "#b91c1c" }}>Run failed</strong>
            <pre style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", fontSize: 12.5, color: "#7f1d1d" }}>{run.error}</pre>
          </section>
        ) : null}

        {/* ─── The headline: engine compute time ─── */}
        {run && !run.error && typeof engineUs === "number" ? (
          <section style={card}>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "baseline" }}>
              <div>
                <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted, #71717a)" }}>
                  Engine compute
                </div>
                <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.05, color: "var(--accent, #2563eb)", letterSpacing: "-0.02em" }}>
                  {fmtMicros(engineUs)}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted, #71717a)", marginTop: 2 }}>pure rule evaluation</div>
              </div>
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "3px 12px",
                    borderRadius: 999,
                    background: decisionColor,
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  {decision}
                </span>
                <div style={{ fontSize: 12, color: "var(--text-muted, #71717a)", marginTop: 8 }}>
                  engine call <strong style={{ color: "var(--text, #18181b)" }}>{fmtMs(networkMs)}</strong>
                  {run.timing ? ` · via ${run.timing.mode}${run.timing.fellBackFromHttp ? " (http unreachable)" : ""}` : ""}
                </div>
              </div>
            </div>

            {/* Comparison bar: engine compute vs the loopback HTTP call (network + JSON) */}
            <div style={{ marginTop: 18 }}>
              <div style={{ display: "flex", height: 22, borderRadius: 6, overflow: "hidden", border: "1px solid var(--border, #e4e4e7)" }}>
                <div
                  style={{
                    width: `${Math.max(1.5, Math.min(100, enginePctOfNetwork))}%`,
                    minWidth: 4,
                    background: "var(--accent, #2563eb)",
                  }}
                  title={`engine ${fmtMicros(engineUs)}`}
                />
                <div style={{ flex: 1, background: "var(--bg-subtle, #f4f4f5)" }} title="network + JSON serialization" />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11.5, color: "var(--text-muted, #71717a)" }}>
                <span>
                  <span style={{ color: "var(--accent, #2563eb)", fontWeight: 700 }}>■</span> engine {fmtMicros(engineUs)}
                  {enginePctOfNetwork > 0 ? ` (${enginePctOfNetwork < 1 ? enginePctOfNetwork.toFixed(1) : enginePctOfNetwork.toFixed(0)}% of the call)` : ""}
                </span>
                <span>network + serialization {fmtMs(Math.max(0, networkMs - (engineMs ?? 0)))}</span>
              </div>
            </div>

            {run.timing ? (
              <p style={{ fontSize: 11.5, color: "var(--text-muted, #a1a1aa)", marginTop: 12, marginBottom: 0 }}>
                {typeof stageMs === "number"
                  ? `Test-harness only — the editor spent ${fmtMs(stageMs)} compiling + staging rules before the call; that step doesn't exist in production. `
                  : ""}
                Client round-trip {fmtMs(roundTrip)} total.
              </p>
            ) : null}
          </section>
        ) : null}

        {/* ─── Benchmark ─── */}
        {benchStats ? (
          <section style={card}>
            <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted, #71717a)", marginBottom: 10 }}>
              Engine compute across {benchStats.count} runs
            </div>
            <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
              {([["min", benchStats.min], ["p50 (median)", benchStats.p50], ["p95", benchStats.p95], ["max", benchStats.max]] as const).map(
                ([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 11, color: "var(--text-muted, #71717a)" }}>{k}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: k === "p50 (median)" ? "var(--accent, #2563eb)" : "var(--text, #18181b)" }}>
                      {fmtMicros(v)}
                    </div>
                  </div>
                ),
              )}
            </div>
          </section>
        ) : null}

        {/* ─── Result + trace ─── */}
        {run && !run.error && run.envelope ? (
          <section style={card}>
            <button type="button" onClick={() => setShowResult((s) => !s)} style={discloseBtn}>
              {showResult ? "▾" : "▸"} Result
            </button>
            {showResult ? (
              <pre style={preStyle}>{JSON.stringify(run.envelope.result ?? null, null, 2)}</pre>
            ) : null}

            {run.envelope.trace && run.envelope.trace.length > 0 ? (
              <>
                <button type="button" onClick={() => setShowTrace((s) => !s)} style={{ ...discloseBtn, marginTop: 10 }}>
                  {showTrace ? "▾" : "▸"} Trace ({run.envelope.trace.length} nodes)
                </button>
                {showTrace ? (
                  <div style={{ marginTop: 8 }}>
                    {run.envelope.trace.map((t, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontFamily: "var(--font-mono, monospace)", padding: "2px 0", color: "var(--text-muted, #52525b)" }}>
                        <span>
                          {t.nodeId} · <span style={{ color: t.outcome === "pass" || t.outcome === "apply" ? "#16a34a" : t.outcome === "error" ? "#dc2626" : "#a16207" }}>{t.outcome}</span>
                        </span>
                        <span>{t.durationMs} ms</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  border: "1px solid var(--border, #e4e4e7)",
  borderRadius: 12,
  padding: 18,
  background: "var(--surface, #fff)",
};
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-muted, #52525b)",
  marginBottom: 5,
};
const preStyle: React.CSSProperties = {
  margin: "8px 0 0",
  padding: 12,
  borderRadius: 8,
  background: "var(--bg-subtle, #f4f4f5)",
  fontSize: 12.5,
  lineHeight: 1.5,
  overflow: "auto",
  maxHeight: 360,
};
function primaryBtn(busy: boolean): React.CSSProperties {
  return {
    padding: "8px 18px",
    borderRadius: 8,
    border: 0,
    background: "var(--accent, #2563eb)",
    color: "#fff",
    fontWeight: 700,
    fontSize: 13,
    cursor: busy ? "default" : "pointer",
    opacity: busy ? 0.7 : 1,
  };
}
const ghostBtn: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid var(--border, #d4d4d8)",
  background: "transparent",
  color: "var(--text, #3f3f46)",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};
const discloseBtn: React.CSSProperties = {
  border: 0,
  background: "transparent",
  padding: 0,
  fontSize: 13,
  fontWeight: 700,
  color: "var(--text, #18181b)",
  cursor: "pointer",
};
