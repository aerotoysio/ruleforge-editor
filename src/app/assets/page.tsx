import Link from "next/link";
import { Plus, Package, LayoutTemplate } from "lucide-react";
import { requireWorkspace } from "@/lib/server/require-workspace";
import { listAssetsFull, listTemplatesFull } from "@/lib/server/workspace";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Asset, OutputTemplate } from "@/lib/types";

export default async function AssetsPage() {
  const root = await requireWorkspace();
  const [assets, templates] = await Promise.all([listAssetsFull(root), listTemplatesFull(root)]);
  const tplById = new Map(templates.map((t) => [t.id, t]));

  // Group assets by their template — one section (with a card grid) per template.
  const groups = new Map<string, { template?: OutputTemplate; assets: Asset[] }>();
  for (const a of assets) {
    const g = groups.get(a.templateId) ?? { template: tplById.get(a.templateId), assets: [] };
    g.assets.push(a);
    groups.set(a.templateId, g);
  }
  const groupList = Array.from(groups.entries()).sort((a, b) => {
    const an = a[1].template?.name ?? a[0];
    const bn = b[1].template?.name ?? b[0];
    return an.localeCompare(bn);
  });

  return (
    <>
      <PageHeader
        title="Assets"
        description="Concrete instances of an output template — a specific bag fee, tax line, discount, or fare. Rules look one up at runtime and downstream nodes can mutate any field for the current iteration."
        actions={
          <Link href="/assets/new">
            <button className="btn primary">
              <Plus className="w-3.5 h-3.5" /> New asset
            </button>
          </Link>
        }
      />
      <div className="flex-1 overflow-auto" style={{ padding: "8px 28px 80px", background: "var(--bg)" }}>
        <style>{`
          .rf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(232px,1fr));gap:12px}
          .rf-card{border:1px solid var(--border);border-radius:7px;background:var(--panel);padding:13px 15px;display:flex;flex-direction:column;gap:8px;min-height:108px;transition:border-color .12s, box-shadow .12s, transform .12s}
          .rf-card:hover{border-color:var(--accent);box-shadow:var(--shadow-sm);transform:translateY(-1px)}
        `}</style>
        {assets.length === 0 ? (
          <EmptyState
            icon={<Package className="w-8 h-8" />}
            title="No assets yet"
            description="Define the shape in Templates first, then create assets that fill it in. A bag-fee template can have dozens of assets — extra-bag, oversize, sports-equipment — all selectable from a single rule."
            action={
              templates.length === 0 ? (
                <Link href="/templates/new">
                  <button className="btn primary"><LayoutTemplate className="w-3.5 h-3.5" /> Define a template first</button>
                </Link>
              ) : (
                <Link href="/assets/new">
                  <button className="btn primary"><Plus className="w-3.5 h-3.5" /> New asset</button>
                </Link>
              )
            }
          />
        ) : (
          <div className="flex flex-col" style={{ gap: 26 }}>
            {groupList.map(([templateId, { template, assets: items }]) => {
              const previewFields = (template?.fields ?? []).slice(0, 4).map((f) => f.name);
              return (
                <section key={templateId}>
                  <div className="flex items-center gap-2" style={{ marginBottom: 11 }}>
                    <LayoutTemplate className="w-4 h-4" style={{ color: "var(--text-muted)" }} strokeWidth={1.8} />
                    {template ? (
                      <Link href={`/templates/${encodeURIComponent(template.id)}`} style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text)" }}>
                        {template.name}
                      </Link>
                    ) : (
                      <span style={{ fontSize: 14, fontWeight: 600, color: "var(--warn)" }}>
                        {templateId} <span style={{ fontWeight: 400, opacity: 0.75 }}>(template missing)</span>
                      </span>
                    )}
                    {template?.category ? (
                      <span className="status-badge draft" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {template.category}
                      </span>
                    ) : null}
                    <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>
                      {items.length} {items.length === 1 ? "asset" : "assets"}
                    </span>
                  </div>
                  <div className="rf-grid">
                    {items.map((a) => (
                      <Link key={a.id} href={`/assets/${encodeURIComponent(a.id)}`} className="rf-card">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate" style={{ fontWeight: 600, fontSize: 13.5, letterSpacing: "-0.01em", color: "var(--text)" }}>
                              {a.name ?? a.id}
                            </div>
                            <div className="mono truncate" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{a.id}</div>
                          </div>
                          <Package className="w-4 h-4" style={{ color: "var(--text-faint)", flexShrink: 0 }} strokeWidth={1.8} />
                        </div>
                        <div className="flex flex-col" style={{ gap: 3 }}>
                          {previewFields.length === 0 ? (
                            <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>no fields</span>
                          ) : (
                            previewFields.map((f) => (
                              <div key={f} className="flex items-baseline gap-1.5" style={{ fontSize: 11.5, minWidth: 0 }}>
                                <span className="mono truncate" style={{ color: "var(--text-muted)", flexShrink: 0, maxWidth: "48%" }}>{f}</span>
                                <span className="mono truncate" style={{ color: "var(--text-dim)" }}>{formatValue(a.values[f])}</span>
                              </div>
                            ))
                          )}
                        </div>
                        <div className="flex items-center justify-between" style={{ marginTop: "auto", paddingTop: 2 }}>
                          {a.category ? (
                            <span className="status-badge" style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", background: "var(--panel-2)" }}>
                              {a.category}
                            </span>
                          ) : <span />}
                          <span style={{ fontSize: 10.5, color: "var(--text-faint)" }}>
                            {a.updatedAt ? new Date(a.updatedAt).toLocaleDateString() : ""}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function formatValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v.length > 22 ? `"${v.slice(0, 20)}…"` : `"${v}"`;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === "object") return `{${Object.keys(v).length}}`;
  return JSON.stringify(v);
}
