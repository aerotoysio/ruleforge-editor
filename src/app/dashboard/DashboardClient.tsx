"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { RefreshCw, Database, LayoutTemplate, Package, Boxes } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

export type DashboardStats = {
  totalRules: number;
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

type EngineStatus = {
  configured: boolean;
  online?: boolean;
  latencyMs?: number;
  url?: string;
  engineVersion?: string;
  uptimeSeconds?: number;
  bindingCount?: number;
  ruleSource?: string;
  referenceSource?: string;
  error?: string;
};

const sectionTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 10,
};

function fmtUptime(s?: number): string {
  if (s == null) return "—";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m`;
  return `${s}s`;
}
function titleCase(id: string): string {
  return id.split(/[-_]/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : "")).join(" ");
}

export function DashboardClient({ stats }: { stats: DashboardStats }) {
  const [eng, setEng] = useState<EngineStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const probe = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/engine/status");
      setEng(await r.json());
    } catch {
      setEng({ configured: stats.engineConfigured, online: false });
    } finally {
      setLoading(false);
    }
  }, [stats.engineConfigured]);

  useEffect(() => {
    probe();
    const t = setInterval(probe, 5000);
    return () => clearInterval(t);
  }, [probe]);

  const online = eng?.online === true;
  const teams = Object.entries(stats.byTeam).sort((a, b) => b[1] - a[1]);
  const cats = Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const dotColor = !eng?.configured ? "var(--text-faint)" : online ? "var(--success)" : "var(--danger)";
  const statusLabel = !eng?.configured ? "Not configured" : online ? "Online" : "Offline";

  return (
    <>
      <style>{`
        .dash-card{border:1px solid var(--border);border-radius:7px;background:var(--panel);padding:16px 18px}
        .dash-stat{border:1px solid var(--border);border-radius:7px;background:var(--panel);padding:14px 16px;display:flex;flex-direction:column;gap:3px;transition:border-color .12s}
        a:hover>.dash-stat{border-color:var(--accent)}
        .dash-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}
        .dash-num{font-size:26px;font-weight:700;letter-spacing:-0.02em;line-height:1.1}
        .dash-lbl{font-size:11.5px;color:var(--text-muted);font-weight:500}
        .dash-bar-track{height:6px;border-radius:3px;background:var(--panel-2);overflow:hidden}
        .dash-bar-fill{height:100%;background:var(--accent);border-radius:3px}
      `}</style>

      <PageHeader
        eyebrow="Workspace"
        title="Overview"
        description={`Live engine health and rule statistics${stats.isAdmin ? "" : " for your team"}.`}
      />

      <div style={{ padding: "8px 28px 48px", maxWidth: 1080, display: "flex", flexDirection: "column", gap: 26 }}>
        {/* ENGINE SERVICE HEALTH */}
        <section>
          <h2 style={sectionTitle}>Engine service</h2>
          <div className="dash-card">
            <div className="flex items-center" style={{ gap: 10 }}>
              <span
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 999,
                  background: dotColor,
                  boxShadow: online ? "0 0 0 3px rgba(34,197,94,0.22)" : "none",
                  flexShrink: 0,
                }}
              />
              <span style={{ fontWeight: 600, fontSize: 14 }}>{statusLabel}</span>
              {eng?.url ? <span className="mono" style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{eng.url}</span> : null}
              <button
                onClick={probe}
                title="Refresh"
                style={{ marginLeft: "auto", border: "1px solid var(--border)", borderRadius: 4, background: "var(--panel)", color: "var(--text-dim)", width: 28, height: 28, display: "grid", placeItems: "center", cursor: "pointer" }}
              >
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
            {!eng?.configured ? (
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 10 }}>
                No engine endpoint configured. Set it in{" "}
                <Link href="/settings" style={{ color: "var(--accent)" }}>Settings → Engine runtime</Link>.
              </div>
            ) : !online ? (
              <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 12 }}>
                Engine not reachable{eng?.error ? ` — ${eng.error}` : ""}. It may be stopped or still starting.
              </div>
            ) : (
              <div className="dash-grid" style={{ marginTop: 16 }}>
                <Metric label="Version" value={eng?.engineVersion ?? "—"} mono />
                <Metric label="Uptime" value={fmtUptime(eng?.uptimeSeconds)} />
                <Metric label="Live bindings" value={String(eng?.bindingCount ?? "—")} />
                <Metric label="Latency" value={eng?.latencyMs != null ? `${eng.latencyMs} ms` : "—"} />
                <Metric label="Rule source" value={eng?.ruleSource ?? "—"} />
                <Metric label="Reference source" value={eng?.referenceSource ?? "—"} />
              </div>
            )}
          </div>
        </section>

        {/* RULES */}
        <section>
          <h2 style={sectionTitle}>Rules{stats.isAdmin ? "" : " · your team"}</h2>
          <div className="dash-grid" style={{ marginBottom: 14 }}>
            <Stat num={stats.totalRules} label="Total rules" accent href="/rules" />
            <Stat num={stats.byStatus.published} label="Live" />
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

function Metric({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="dash-lbl">{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, fontFamily: mono ? "var(--font-mono, ui-monospace, monospace)" : undefined, marginTop: 2 }}>{value}</div>
    </div>
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
