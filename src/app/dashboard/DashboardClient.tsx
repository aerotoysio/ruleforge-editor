"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { RefreshCw, Database, LayoutTemplate, Package, Boxes, Server, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/PageHeader";

export type DashboardStats = {
  totalRules: number;
  live: number;
  scheduled: number;
  byStatus: { published: number; review: number; draft: number };
  byTeam: Record<string, number>;
  byCategory: Record<string, number>;
  references: number;
  templates: number;
  assets: number;
  nodes: number;
  engineConfigured: boolean;
  isAdmin: boolean;
  userLabel: string | null;
};

type Engine = {
  id: string;
  name: string | null;
  url: string | null;
  version: string | null;
  ruleSource: string | null;
  bindingCount: number | null;
  generation: string | null;
  uptimeSeconds: number | null;
  secondsAgo: number;
  online: boolean;
};

const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 10,
};

function fmtUptime(s?: number | null): string {
  if (s == null) return "—";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${s}s`;
}
function seenAgo(s: number): string {
  if (s < 2) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
}
function titleCase(id: string): string {
  return id.split(/[-_]/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : "")).join(" ");
}

export function DashboardClient({ stats }: { stats: DashboardStats }) {
  const [engines, setEngines] = useState<Engine[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState(false);

  const probe = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/fleet/engines");
      const d = await r.json();
      setEngines(Array.isArray(d.engines) ? d.engines : []);
    } catch {
      /* keep last */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    probe();
    const t = setInterval(probe, 5000);
    return () => clearInterval(t);
  }, [probe]);

  async function pushToFleet() {
    setPushing(true);
    try {
      const r = await fetch("/api/fleet/publish", { method: "POST" });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d.error ?? "Publish failed");
        return;
      }
      toast.success(`Pushed to ${d.refreshed}/${d.total} engine${d.total === 1 ? "" : "s"} — re-pulling latest`);
      setTimeout(probe, 800); // let them re-sync, then refresh the view
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPushing(false);
    }
  }

  const onlineCount = engines.filter((e) => e.online).length;
  // Sync-freshness: are all online engines on the same generation?
  const gens = new Set(engines.filter((e) => e.online && e.generation).map((e) => e.generation));
  const teams = Object.entries(stats.byTeam).sort((a, b) => b[1] - a[1]);
  const cats = Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <>
      <style>{`
        .dash-card{border:1px solid var(--border);border-radius:7px;background:var(--panel);padding:16px 18px}
        .dash-stat{border:1px solid var(--border);border-radius:7px;background:var(--panel);padding:14px 16px;display:flex;flex-direction:column;gap:3px;transition:border-color .12s}
        a:hover>.dash-stat{border-color:var(--accent)}
        .dash-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
        .eng-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(266px,1fr));gap:12px}
        .dash-num{font-size:26px;font-weight:700;letter-spacing:-0.02em;line-height:1.1}
        .dash-lbl{font-size:11.5px;color:var(--text-muted);font-weight:500}
        .dash-bar-track{height:6px;border-radius:3px;background:var(--panel-2);overflow:hidden}
        .dash-bar-fill{height:100%;background:var(--accent);border-radius:3px}
        .refresh-btn{border:1px solid var(--border);border-radius:4px;background:var(--panel);color:var(--text-dim);width:28px;height:28px;display:grid;place-items:center;cursor:pointer}
      `}</style>

      <PageHeader
        eyebrow="Workspace"
        title="Overview"
        description={`Live engine fleet health and rule statistics${stats.isAdmin ? "" : " for your team"}.`}
      />

      <div style={{ padding: "8px 28px 48px", maxWidth: 1080, display: "flex", flexDirection: "column", gap: 26 }}>
        {/* ENGINE FLEET */}
        <section>
          <div className="flex items-center" style={{ gap: 8, marginBottom: 10 }}>
            <h2 style={{ ...sectionTitle, marginBottom: 0 }}>Engine fleet</h2>
            {engines.length > 0 ? (
              <span className="mono" style={{ fontSize: 11, color: onlineCount === engines.length ? "var(--success)" : "var(--text-muted)" }}>
                {onlineCount}/{engines.length} online
              </span>
            ) : null}
            {engines.length > 0 ? (
              <span style={{ fontSize: 11, color: gens.size <= 1 ? "var(--text-muted)" : "var(--warn)" }}>
                · {gens.size <= 1 ? "in sync" : `${gens.size} versions live`}
              </span>
            ) : null}
            <button
              onClick={pushToFleet}
              disabled={pushing || engines.length === 0}
              title="Refresh every registered engine to the latest published rules"
              style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, height: 28, padding: "0 11px", border: 0, borderRadius: 4, background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: pushing || engines.length === 0 ? "default" : "pointer", opacity: pushing || engines.length === 0 ? 0.6 : 1 }}
            >
              <UploadCloud size={13} /> {pushing ? "Pushing…" : "Push to fleet"}
            </button>
            <button onClick={probe} title="Refresh" className="refresh-btn">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </button>
          </div>

          {engines.length === 0 ? (
            <div className="dash-card" style={{ display: "flex", gap: 10, alignItems: "flex-start", color: "var(--text-muted)" }}>
              <Server size={18} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 12.5 }}>
                No engines have registered yet. Start one with <code className="mono">RULEFORGE_CONTROL_URL</code> pointing at this editor and it appears here within ~15s.
              </div>
            </div>
          ) : (
            <div className="eng-grid">
              {engines.map((e) => (
                <div key={e.id} className="dash-card" style={{ opacity: e.online ? 1 : 0.55, display: "flex", flexDirection: "column", gap: 7 }}>
                  <div className="flex items-center justify-between" style={{ gap: 8 }}>
                    <div className="flex items-center" style={{ gap: 8, minWidth: 0 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 999, background: e.online ? "var(--success)" : "var(--danger)", boxShadow: e.online ? "0 0 0 3px rgba(34,197,94,0.22)" : "none", flexShrink: 0 }} />
                      <span className="truncate" style={{ fontWeight: 600, fontSize: 13.5 }}>{e.name || e.id}</span>
                    </div>
                    <span className="mono" style={{ fontSize: 10.5, color: "var(--text-muted)", flexShrink: 0 }}>{e.version ?? "—"}</span>
                  </div>
                  <div className="mono truncate" style={{ fontSize: 11, color: "var(--text-muted)" }}>{e.url ?? e.id}</div>
                  <div className="flex items-center" style={{ gap: 8, fontSize: 11.5, color: "var(--text-dim)", flexWrap: "wrap" }}>
                    <span><b style={{ color: "var(--text)" }}>{e.bindingCount ?? "—"}</b> bindings</span>
                    <span style={{ color: "var(--text-faint)" }}>·</span>
                    <span>up {fmtUptime(e.uptimeSeconds)}</span>
                    <span style={{ color: "var(--text-faint)" }}>·</span>
                    <span className="mono">{e.ruleSource ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between" style={{ fontSize: 10.5, color: "var(--text-faint)" }}>
                    <span>{e.online ? "seen " : "last seen "}{seenAgo(e.secondsAgo)}</span>
                    {e.generation ? <span className="mono" title={`sync generation ${e.generation}`}>gen {e.generation.slice(0, 7)}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* RULES */}
        <section>
          <h2 style={sectionTitle}>Rules{stats.isAdmin ? "" : " · your team"}</h2>
          <div className="dash-grid" style={{ marginBottom: 14 }}>
            <Stat num={stats.totalRules} label="Total rules" accent href="/rules" />
            <Stat num={stats.live} label="Live" />
            <Stat num={stats.scheduled} label="Scheduled" />
            <Stat num={stats.byStatus.review} label="In review" />
            <Stat num={stats.byStatus.draft} label="Draft" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Breakdown title="By team" rows={teams.map(([k, v]) => ({ label: k === "unassigned" ? "Unassigned" : titleCase(k), value: v }))} total={stats.totalRules} />
            <Breakdown title="By category" rows={cats.map(([k, v]) => ({ label: k, value: v }))} total={stats.totalRules} />
          </div>
        </section>

        {/* WORKSPACE */}
        <section>
          <h2 style={sectionTitle}>Workspace data</h2>
          <div className="dash-grid">
            <Stat num={stats.references} label="References" icon={<Database size={15} />} href="/references" />
            <Stat num={stats.templates} label="Templates" icon={<LayoutTemplate size={15} />} href="/templates" />
            <Stat num={stats.assets} label="Assets" icon={<Package size={15} />} href="/assets" />
            <Stat num={stats.nodes} label="Nodes" icon={<Boxes size={15} />} href="/nodes" />
          </div>
        </section>
      </div>
    </>
  );
}

function Stat({ num, label, accent, icon, href }: { num: number; label: string; accent?: boolean; icon?: ReactNode; href?: string }) {
  const inner = (
    <div className="dash-stat">
      <div className="flex items-center justify-between">
        <span className="dash-num" style={{ color: accent ? "var(--accent)" : "var(--text)" }}>{num}</span>
        {icon ? <span style={{ color: "var(--text-faint)" }}>{icon}</span> : null}
      </div>
      <span className="dash-lbl">{label}</span>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function Breakdown({ title, rows, total }: { title: string; rows: { label: string; value: number }[]; total: number }) {
  return (
    <div className="dash-card">
      <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}>{title}</div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-faint)" }}>None</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {rows.map((r) => (
            <div key={r.label}>
              <div className="flex items-center justify-between" style={{ fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: "var(--text-dim)" }}>{r.label}</span>
                <span className="mono" style={{ color: "var(--text-muted)" }}>{r.value}</span>
              </div>
              <div className="dash-bar-track">
                <div className="dash-bar-fill" style={{ width: `${total ? Math.round((r.value / total) * 100) : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
