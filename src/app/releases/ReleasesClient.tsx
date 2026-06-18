"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Rocket, RotateCcw, Clock, CircleSlash, ChevronDown, ChevronRight, History } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

export type RuleRelease = {
  id: string;
  name: string;
  endpoint: string;
  method: string;
  currentVersion: number;
  liveVersion: number | null;
  scheduled: { version: number; effectiveAt: string | null }[];
};

type FeedItem = {
  id: number;
  ruleId: string;
  version: number;
  action: string;
  status: string;
  effectiveAt: string | null;
  createdAt: string;
  createdBy: string | null;
  note: string | null;
};

function when(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

const actionTone: Record<string, { bg: string; fg: string }> = {
  publish: { bg: "var(--accent-soft, rgba(225,29,46,0.12))", fg: "var(--accent)" },
  rollback: { bg: "var(--warn-soft)", fg: "var(--warn)" },
  unpublish: { bg: "var(--panel-2)", fg: "var(--text-muted)" },
};

export function ReleasesClient({ rules, feed, canPublish }: { rules: RuleRelease[]; feed: FeedItem[]; canPublish: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, FeedItem[]>>({});
  const [scheduleFor, setScheduleFor] = useState<string | null>(null);
  const [scheduleTime, setScheduleTime] = useState("");

  async function act(ruleId: string, body: Record<string, unknown>, ok: string) {
    setBusy(ruleId);
    try {
      const r = await fetch(`/api/rules/${encodeURIComponent(ruleId)}/release`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error ?? "Failed");
        return;
      }
      toast.success(ok);
      if (history[ruleId]) setHistory((h) => { const n = { ...h }; delete n[ruleId]; return n; });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function toggleHistory(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!history[id]) {
      const r = await fetch(`/api/rules/${encodeURIComponent(id)}/release`);
      if (r.ok) {
        const d = await r.json();
        setHistory((h) => ({ ...h, [id]: d.releases ?? [] }));
      }
    }
  }

  // Deep-link from a test response (TestPanel links ruleId@version → ?rule=<id>):
  // auto-expand that rule's audit history and scroll to it, so a response traces
  // straight to its immutable version's release record.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const target = new URLSearchParams(window.location.search).get("rule");
    if (target && rules.some((r) => r.id === target)) {
      void toggleHistory(target);
      setTimeout(() => document.getElementById(`rel-${target}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <style>{`
        .rel-card{border:1px solid var(--border);border-radius:7px;background:var(--panel);padding:0;box-shadow:var(--shadow-sm)}
        .rel-row{display:flex;align-items:center;gap:12px;padding:13px 15px}
        .rel-pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;padding:2px 8px;border-radius:4px}
        .rel-btn{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 10px;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid var(--border);background:var(--panel);color:var(--text-dim);transition:all .12s}
        .rel-btn:hover{border-color:var(--accent);color:var(--accent)}
        .rel-btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
        .rel-btn.primary:hover{filter:brightness(1.08);color:#fff}
        .rel-btn:disabled{opacity:.5;cursor:default}
      `}</style>

      <PageHeader
        eyebrow="Release management"
        title="Releases"
        description="What's live on the fleet, what's scheduled, and the immutable audit trail. Publishing freezes a version; the engine only ever serves published versions, so a draft can't go live — even on restart."
      />

      <div style={{ padding: "8px 28px 48px", display: "flex", flexDirection: "column", gap: 26 }}>
        {/* RULES */}
        <section>
          <h2 style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            Rules · {rules.length}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rules.map((r) => {
              const isLive = r.liveVersion != null;
              const draftAhead = r.currentVersion > (r.liveVersion ?? 0);
              const open = expanded === r.id;
              return (
                <div key={r.id} id={`rel-${r.id}`} className="rel-card">
                  <div className="rel-row">
                    <button onClick={() => toggleHistory(r.id)} title="History" style={{ border: 0, background: "transparent", color: "var(--text-muted)", cursor: "pointer", padding: 0, display: "grid", placeItems: "center" }}>
                      {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    </button>
                    <div className="min-w-0" style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.name}</div>
                      <div className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>{r.method} {r.endpoint}</div>
                    </div>
                    {/* live / scheduled / draft state */}
                    <div className="flex items-center" style={{ gap: 8 }}>
                      {isLive ? (
                        <span className="rel-pill" style={{ background: "var(--success-soft)", color: "var(--success)" }}>
                          <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--success)" }} /> Live v{r.liveVersion}
                        </span>
                      ) : (
                        <span className="rel-pill" style={{ background: "var(--panel-2)", color: "var(--text-muted)" }}>Not live</span>
                      )}
                      {r.scheduled.length > 0 ? (
                        <span className="rel-pill" style={{ background: "var(--warn-soft)", color: "var(--warn)" }} title={r.scheduled.map((s) => `v${s.version} @ ${when(s.effectiveAt)}`).join(", ")}>
                          <Clock size={11} /> {r.scheduled.length} scheduled
                        </span>
                      ) : null}
                      {draftAhead ? <span className="mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>draft v{r.currentVersion}</span> : null}
                    </div>
                    {/* actions */}
                    {canPublish ? (
                      <div className="flex items-center" style={{ gap: 6 }}>
                        <button className="rel-btn primary" disabled={busy === r.id} onClick={() => act(r.id, { action: "publish", note: "published from Releases" }, "Published — push to fleet to roll out")}>
                          <Rocket size={13} /> Publish v{r.currentVersion}
                        </button>
                        <button className="rel-btn" disabled={busy === r.id} onClick={() => setScheduleFor(scheduleFor === r.id ? null : r.id)}>
                          <Clock size={13} /> Schedule
                        </button>
                        {isLive ? (
                          <button className="rel-btn" disabled={busy === r.id} title="Stop serving this rule on the fleet" onClick={() => { if (confirm(`Unpublish ${r.name}? The endpoint stops resolving on the fleet.`)) act(r.id, { action: "unpublish" }, "Unpublished"); }}>
                            <CircleSlash size={13} /> Unpublish
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {/* schedule row */}
                  {scheduleFor === r.id ? (
                    <div className="flex items-center" style={{ gap: 8, padding: "0 15px 13px 40px" }}>
                      <input
                        type="datetime-local"
                        value={scheduleTime}
                        onChange={(e) => setScheduleTime(e.target.value)}
                        style={{ height: 28, borderRadius: 4, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text)", padding: "0 8px", fontSize: 12 }}
                      />
                      <button
                        className="rel-btn primary"
                        disabled={!scheduleTime || busy === r.id}
                        onClick={() => { void act(r.id, { action: "publish", scheduledFor: new Date(scheduleTime).toISOString(), note: "scheduled release" }, `Scheduled v${r.currentVersion} for ${scheduleTime}`); setScheduleFor(null); setScheduleTime(""); }}
                      >
                        Schedule v{r.currentVersion}
                      </button>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>goes live automatically at that time</span>
                    </div>
                  ) : null}

                  {/* history */}
                  {open ? (
                    <div style={{ borderTop: "1px solid var(--border)", padding: "10px 15px 12px 40px" }}>
                      {!history[r.id] ? (
                        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading history…</div>
                      ) : history[r.id].length === 0 ? (
                        <div style={{ fontSize: 12, color: "var(--text-faint)" }}>No releases yet.</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                          {history[r.id].map((h) => (
                            <div key={h.id} className="flex items-center" style={{ gap: 10, fontSize: 12 }}>
                              <span className="rel-pill" style={{ background: (actionTone[h.action] ?? actionTone.unpublish).bg, color: (actionTone[h.action] ?? actionTone.unpublish).fg, minWidth: 70, justifyContent: "center" }}>
                                {h.action}
                              </span>
                              <span className="mono" style={{ fontWeight: 600 }}>v{h.version}</span>
                              <span style={{ color: h.status === "live" ? "var(--success)" : h.status === "scheduled" ? "var(--warn)" : "var(--text-faint)" }}>{h.status}</span>
                              <span style={{ color: "var(--text-muted)" }}>{when(h.effectiveAt ?? h.createdAt)}</span>
                              <span style={{ color: "var(--text-dim)" }}>{h.createdBy ?? "system"}</span>
                              {h.note ? <span style={{ color: "var(--text-faint)" }}>· {h.note}</span> : null}
                              {canPublish && h.action !== "rollback" && r.liveVersion !== h.version ? (
                                <button className="rel-btn" style={{ marginLeft: "auto", height: 24 }} disabled={busy === r.id} onClick={() => act(r.id, { action: "rollback", toVersion: h.version }, `Rolled back to v${h.version}`)}>
                                  <RotateCcw size={12} /> Roll back to v{h.version}
                                </button>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        {/* AUDIT FEED */}
        <section>
          <h2 style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <History size={13} /> Recent activity
          </h2>
          {feed.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 7, padding: 14 }}>No releases recorded yet.</div>
          ) : (
            <div style={{ border: "1px solid var(--border)", borderRadius: 7, overflow: "hidden" }}>
              {feed.map((h, i) => (
                <div key={h.id} className="flex items-center" style={{ gap: 10, fontSize: 12, padding: "9px 14px", borderTop: i ? "1px solid var(--border)" : undefined }}>
                  <span className="rel-pill" style={{ background: (actionTone[h.action] ?? actionTone.unpublish).bg, color: (actionTone[h.action] ?? actionTone.unpublish).fg, minWidth: 70, justifyContent: "center" }}>{h.action}</span>
                  <span style={{ fontWeight: 600, minWidth: 0 }} className="truncate">{h.ruleId}</span>
                  <span className="mono">v{h.version}</span>
                  <span style={{ color: h.status === "live" ? "var(--success)" : h.status === "scheduled" ? "var(--warn)" : "var(--text-faint)" }}>{h.status}</span>
                  <span style={{ marginLeft: "auto", color: "var(--text-muted)" }}>{h.createdBy ?? "system"}</span>
                  <span style={{ color: "var(--text-faint)" }}>{when(h.effectiveAt ?? h.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
