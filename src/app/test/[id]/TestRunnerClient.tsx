"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Play, ArrowLeft, History, ChevronDown } from "lucide-react";

type SavedTest = { id: string; name: string; payload: unknown };

type Props = {
  ruleId: string;
  ruleName: string;
  endpoint: string;
  method: string;
  tests: SavedTest[];
};

type EnvelopeOutcome = "pass" | "fail" | "skip" | "error";

type TraceEntry = {
  nodeId: string;
  startedAt?: string;
  durationMs?: number;
  outcome?: EnvelopeOutcome;
  input?: unknown;
  output?: unknown;
  error?: string;
};

type Envelope = {
  ruleId?: string;
  ruleVersion?: number;
  decision?: "apply" | "skip" | "error";
  evaluatedAt?: string;
  result?: unknown;
  trace?: TraceEntry[];
  durationMs?: number;
};

type ApiResponse =
  | { envelope: Envelope; stderr?: string; otherCompileErrors?: { ruleId: string; detail: string }[] }
  | { error: string; detail?: string; stdout?: string; stderr?: string; otherCompileErrors?: { ruleId: string; detail: string }[] };

const NODE_TINT: Record<string, string> = {
  pass: "oklch(0.78 0.14 155)",
  skip: "oklch(0.85 0.14 75)",
  fail: "oklch(0.68 0.2 25)",
  error: "oklch(0.68 0.2 25)",
};

export function TestRunnerClient({ ruleId, ruleName, endpoint, method, tests }: Props) {
  const initialPayload = useMemo(() => {
    if (tests[0]?.payload) return JSON.stringify(tests[0].payload, null, 2);
    return "{\n  \n}";
  }, [tests]);

  const [requestText, setRequestText] = useState(initialPayload);
  const [running, setRunning] = useState(false);
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [tab, setTab] = useState<"response" | "raw" | "headers">("response");
  const [pickerOpen, setPickerOpen] = useState(false);

  const envelope: Envelope | null =
    response && "envelope" in response ? response.envelope : null;
  const errorPayload: Extract<ApiResponse, { error: string }> | null =
    response && "error" in response ? response : null;

  async function run() {
    setRunning(true);
    setResponse(null);
    try {
      let payload: unknown;
      try {
        payload = JSON.parse(requestText);
      } catch (parseErr) {
        setResponse({
          error: "invalid_request_json",
          detail: (parseErr as Error).message,
        });
        return;
      }
      const res = await fetch("/api/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ruleId, payload }),
      });
      const data = (await res.json()) as ApiResponse;
      setResponse(data);
    } catch (err) {
      setResponse({ error: "fetch_failed", detail: (err as Error).message });
    } finally {
      setRunning(false);
    }
  }

  const reqLines = requestText.split("\n").length;
  const decision = envelope?.decision ?? "—";
  const decisionTone: "live" | "review" | "fail" =
    decision === "apply" ? "live" : decision === "skip" ? "review" : "fail";

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg)" }}>
      {/* Header strip */}
      <div className="test-head" style={{ paddingLeft: 20, paddingRight: 20 }}>
        <Link href="/test" style={{ color: "var(--text-muted)" }}>
          <ArrowLeft className="w-3.5 h-3.5" />
        </Link>
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
          <span style={{ fontWeight: 600, letterSpacing: "-0.01em", fontSize: 14 }}>
            {ruleName}
          </span>
          <span
            className="mono"
            style={{ fontSize: 11, color: "var(--text-muted)" }}
          >
            {method} {endpoint} · {ruleId}
          </span>
        </div>

        {tests.length > 0 ? (
          <div style={{ position: "relative", marginLeft: 12 }}>
            <button
              className="btn sm"
              onClick={() => setPickerOpen((o) => !o)}
              title="Load a saved test payload"
            >
              <History width={13} height={13} />
              Load saved <ChevronDown width={11} height={11} />
            </button>
            {pickerOpen ? (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  zIndex: 20,
                  minWidth: 240,
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  boxShadow: "var(--shadow-md)",
                  overflow: "hidden",
                }}
              >
                {tests.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setRequestText(JSON.stringify(t.payload, null, 2));
                      setPickerOpen(false);
                    }}
                    className="block w-full text-left px-3 py-2 hover:bg-[var(--panel-2)]"
                    style={{ fontSize: 12.5 }}
                  >
                    <div style={{ fontWeight: 500 }}>{t.name}</div>
                    <div className="mono" style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
                      {t.id}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="actions" style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn primary" onClick={run} disabled={running}>
            <Play /> {running ? "Running…" : "Run test"}
          </button>
        </div>
      </div>

      {/* Body — split: request L, response top R + trace bottom R */}
      <div style={{ flex: 1, minHeight: 0, padding: 16 }}>
        <div className="test-panel">
          <div className="test-body">
            {/* LEFT: REQUEST */}
            <div className="test-pane">
              <div className="pane-head">
                <span style={{ fontWeight: 500, fontSize: 12.5 }}>Request</span>
                <span className="hint mono" style={{ fontSize: 11 }}>
                  application/json · {reqLines} lines
                </span>
              </div>
              <div className="pane-body json-edit-wrap" style={{ overflow: "hidden" }}>
                <div className="line-gutter mono">
                  {Array.from({ length: reqLines }).map((_, i) => (
                    <div key={i}>{i + 1}</div>
                  ))}
                </div>
                <textarea
                  className="json-edit mono"
                  spellCheck={false}
                  value={requestText}
                  onChange={(e) => setRequestText(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      run();
                    }
                  }}
                />
              </div>
              <div className="pane-foot">
                <span className="hint mono" style={{ fontSize: 10.5 }}>
                  Edits run live — Cmd/Ctrl ↵ to fire
                </span>
              </div>
            </div>

            {/* RIGHT: RESPONSE (top) + TRACE (bottom) */}
            <div className="test-right">
              <div className="test-pane">
                <div className="pane-head">
                  <span style={{ fontWeight: 500, fontSize: 12.5 }}>Response</span>
                  {envelope ? (
                    <span
                      className={`status-badge ${decisionTone}`}
                      style={{ height: 20, marginLeft: 4 }}
                    >
                      <span className="dot" /> {decision}
                    </span>
                  ) : errorPayload ? (
                    <span className="status-badge fail" style={{ height: 20, marginLeft: 4 }}>
                      <span className="dot" /> error
                    </span>
                  ) : (
                    <span
                      style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 4 }}
                    >
                      idle
                    </span>
                  )}
                  {envelope?.durationMs != null ? (
                    <span
                      className="hint mono"
                      style={{ fontSize: 11, marginLeft: 6 }}
                    >
                      {envelope.durationMs} ms
                      {envelope.ruleVersion != null ? ` · v${envelope.ruleVersion}` : ""}
                    </span>
                  ) : null}
                  <div className="seg" style={{ marginLeft: "auto" }}>
                    {(["response", "raw", "headers"] as const).map((t) => (
                      <button
                        key={t}
                        className={tab === t ? "on" : ""}
                        onClick={() => setTab(t)}
                      >
                        {t === "response" ? "Pretty" : t === "raw" ? "Raw" : "Meta"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="pane-body" style={{ padding: 0 }}>
                  {!response ? (
                    <div
                      style={{
                        padding: 32,
                        textAlign: "center",
                        color: "var(--text-muted)",
                        fontSize: 12,
                      }}
                    >
                      Click <strong>Run test</strong> to evaluate the rule against the request
                      payload.
                    </div>
                  ) : tab === "raw" ? (
                    <pre
                      className="pretty-json"
                      style={{ margin: 0 }}
                    >
                      {JSON.stringify(envelope ?? errorPayload, null, 2)}
                    </pre>
                  ) : tab === "headers" ? (
                    <div style={{ padding: 12, fontSize: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                      {envelope ? (
                        <>
                          <KvRow label="rule.id" value={envelope.ruleId} />
                          <KvRow label="rule.version" value={String(envelope.ruleVersion ?? "")} />
                          <KvRow label="decision" value={envelope.decision} />
                          <KvRow label="evaluated_at" value={envelope.evaluatedAt} />
                          <KvRow label="duration_ms" value={String(envelope.durationMs ?? "")} />
                        </>
                      ) : errorPayload ? (
                        <>
                          <KvRow label="error" value={errorPayload.error} />
                          <KvRow label="detail" value={errorPayload.detail} />
                        </>
                      ) : null}
                    </div>
                  ) : (
                    <PrettyJson
                      src={JSON.stringify(envelope?.result ?? errorPayload ?? null, null, 2)}
                    />
                  )}
                </div>
              </div>

              <div className="test-pane">
                <div className="pane-head">
                  <span style={{ fontWeight: 500, fontSize: 12.5 }}>Trace</span>
                  {envelope?.trace ? (
                    <span className="hint" style={{ fontSize: 11, marginLeft: 6 }}>
                      {envelope.trace.length} nodes ·{" "}
                      {envelope.trace.filter((t) => t.outcome !== "skip").length} evaluated ·{" "}
                      {envelope.trace.filter((t) => t.outcome === "skip").length} skipped
                    </span>
                  ) : null}
                </div>
                <div className="pane-body" style={{ padding: 0 }}>
                  {!envelope?.trace?.length ? (
                    <div
                      style={{
                        padding: 24,
                        textAlign: "center",
                        color: "var(--text-muted)",
                        fontSize: 12,
                      }}
                    >
                      Run the test to see the per-node trace.
                    </div>
                  ) : (
                    <div className="trace-list">
                      {envelope.trace.map((t, i) => (
                        <div
                          key={`${t.nodeId}-${i}`}
                          className={`trace-row ${t.outcome === "skip" ? "skipped" : ""}`}
                        >
                          <span className="trace-step mono">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span
                            className="trace-dot"
                            style={{
                              background: NODE_TINT[t.outcome ?? "pass"] ?? "var(--text-muted)",
                              opacity: t.outcome === "skip" ? 0.4 : 1,
                            }}
                          />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="flex items-center gap-2">
                              <span
                                className="mono"
                                style={{ fontWeight: 500, fontSize: 12.5 }}
                              >
                                {t.nodeId}
                              </span>
                              {t.outcome ? (
                                <span
                                  className={`status-badge ${
                                    t.outcome === "pass"
                                      ? "live"
                                      : t.outcome === "fail" || t.outcome === "error"
                                      ? "fail"
                                      : "draft"
                                  }`}
                                  style={{ height: 18, fontSize: 10.5 }}
                                >
                                  {t.outcome}
                                </span>
                              ) : null}
                            </div>
                            {t.error ? (
                              <div
                                style={{
                                  marginTop: 4,
                                  fontSize: 11.5,
                                  color: "var(--danger)",
                                  fontFamily: "var(--font-mono)",
                                  wordBreak: "break-word",
                                }}
                              >
                                {t.error}
                              </div>
                            ) : t.output !== undefined && t.output !== null ? (
                              <div
                                style={{
                                  marginTop: 4,
                                  fontSize: 11,
                                  color: "var(--text-muted)",
                                  fontFamily: "var(--font-mono)",
                                  whiteSpace: "pre-wrap",
                                  wordBreak: "break-word",
                                  maxHeight: 80,
                                  overflow: "auto",
                                }}
                              >
                                {JSON.stringify(t.output, null, 2)}
                              </div>
                            ) : null}
                          </div>
                          <span className="mono trace-ms">
                            {(t.durationMs ?? 0).toFixed(2)}ms
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KvRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="kv-row">
      <span className="mono" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <span className="mono">{value ?? "—"}</span>
    </div>
  );
}

/**
 * Two-pass JSON syntax highlighter — strings first (incl. keys), then numbers
 * and keywords. Wrapped in try/catch so malformed input doesn't blank the pane.
 */
function PrettyJson({ src }: { src: string }) {
  const html = useMemo(() => {
    try {
      const esc = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      let out = esc(src);
      out = out.replace(/"([^"\\]|\\.)*"(\s*:)?/g, (m) => {
        if (m.trimEnd().endsWith(":")) {
          const q = m.replace(/\s*:\s*$/, "");
          return `<span class="tok-key">${q}</span>:`;
        }
        return `<span class="tok-str">${m}</span>`;
      });
      out = out.replace(/\b(-?\d+\.?\d*)\b/g, '<span class="tok-num">$1</span>');
      out = out.replace(/\b(true|false|null)\b/g, '<span class="tok-kw">$1</span>');
      return out;
    } catch {
      return src;
    }
  }, [src]);

  return (
    <pre className="pretty-json mono" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
