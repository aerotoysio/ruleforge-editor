import Link from "next/link";
import { Plus, Package, LayoutTemplate } from "lucide-react";
import { requireWorkspace } from "@/lib/server/require-workspace";
import { listAssetsFull, listTemplatesFull } from "@/lib/server/workspace";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Asset, OutputTemplate } from "@/lib/types";

export default async function AssetsPage() {
  const root = await requireWorkspace();
  const [assets, templates] = await Promise.all([
    listAssetsFull(root),
    listTemplatesFull(root),
  ]);
  const tplById = new Map(templates.map((t) => [t.id, t]));

  // Group assets by their template — one card per template, list of assets inside.
  // Orphan assets (template was deleted) live in a fallback "unknown template" group.
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
      <div
        className="flex-1 overflow-auto"
        style={{ padding: "8px 28px 80px", background: "var(--bg)" }}
      >
        {assets.length === 0 ? (
          <EmptyState
            icon={<Package className="w-8 h-8" />}
            title="No assets yet"
            description="Define the shape in Templates first, then create assets that fill it in. A bag-fee template can have dozens of assets — extra-bag-1, oversize, sports-equipment — all selectable from a single rule."
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
          <div className="flex flex-col" style={{ gap: 18 }}>
            {groupList.map(([templateId, { template, assets: items }]) => (
              <TemplateGroup
                key={templateId}
                templateId={templateId}
                template={template}
                assets={items}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function TemplateGroup({
  templateId,
  template,
  assets,
}: {
  templateId: string;
  template?: OutputTemplate;
  assets: Asset[];
}) {
  const previewFields = (template?.fields ?? []).slice(0, 3).map((f) => f.name);
  return (
    <section className="tbl-wrap">
      <header
        className="flex items-center justify-between gap-3"
        style={{
          padding: "10px 14px",
          background: "var(--panel-2)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="min-w-0 flex items-center gap-2">
          <LayoutTemplate className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} strokeWidth={1.8} />
          {template ? (
            <Link
              href={`/templates/${encodeURIComponent(template.id)}`}
              className="truncate"
              style={{
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                color: "var(--text)",
              }}
            >
              {template.name}
            </Link>
          ) : (
            <span
              className="truncate"
              style={{ fontSize: 13, fontWeight: 600, color: "var(--warn)" }}
            >
              {templateId} <span style={{ fontWeight: 400, opacity: 0.75 }}>(template missing)</span>
            </span>
          )}
          <span className="mono truncate" style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {templateId}
          </span>
          {template?.category ? (
            <span
              className="status-badge draft"
              style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}
            >
              {template.category}
            </span>
          ) : null}
        </div>
        <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {assets.length} {assets.length === 1 ? "asset" : "assets"}
        </span>
      </header>
      <table className="tbl">
        <thead>
          <tr>
            <th>Name</th>
            <th className="mono" style={{ textTransform: "none", letterSpacing: 0 }}>
              {previewFields.length > 0 ? previewFields.join(" · ") : "(no fields)"}
            </th>
            <th style={{ width: 130 }}>Updated</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((a) => (
            <AssetRow key={a.id} asset={a} previewFields={previewFields} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function AssetRow({ asset, previewFields }: { asset: Asset; previewFields: string[] }) {
  const previewValues = previewFields.map((f) => formatValue(asset.values[f])).join(" · ");
  return (
    <tr style={{ cursor: "pointer" }}>
      <td>
        <Link
          href={`/assets/${encodeURIComponent(asset.id)}`}
          style={{ display: "flex", flexDirection: "column", gap: 1 }}
        >
          <span className="mono" style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
            {asset.id}
          </span>
          <span style={{ fontWeight: 500, color: "var(--text)" }}>
            {asset.name ?? asset.id}
          </span>
        </Link>
      </td>
      <td className="mono" style={{ color: "var(--text-dim)" }}>
        {previewValues || "—"}
      </td>
      <td className="muted">
        {asset.updatedAt ? new Date(asset.updatedAt).toLocaleDateString() : "—"}
      </td>
    </tr>
  );
}

function formatValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v.length > 24 ? `"${v.slice(0, 22)}…"` : `"${v}"`;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === "object") return `{${Object.keys(v).length}}`;
  return JSON.stringify(v);
}
