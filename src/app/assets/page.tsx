import Link from "next/link";
import { Plus, Package, ArrowUpRight, LayoutTemplate } from "lucide-react";
import { requireWorkspace } from "@/lib/server/require-workspace";
import { listAssetsFull, listTemplatesFull } from "@/lib/server/workspace";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
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
        description="Concrete instances of an output template — a specific bag fee, tax line, discount, or fare. Rules look one up at runtime (via the asset-pick node) and downstream nodes can mutate any field for the current iteration."
        actions={
          <Link href="/assets/new">
            <Button variant="default" size="sm">
              <Plus className="w-3.5 h-3.5" /> New asset
            </Button>
          </Link>
        }
      />
      <div className="flex-1 overflow-auto px-8 py-6 bg-muted/30">
        {assets.length === 0 ? (
          <EmptyState
            icon={<Package className="w-8 h-8" />}
            title="No assets yet"
            description="Define the shape in Templates first, then create assets that fill it in. A bag-fee template can have dozens of assets — extra-bag-1, oversize, sports-equipment — all selectable from a single rule."
            action={
              templates.length === 0 ? (
                <Link href="/templates/new">
                  <Button variant="default"><LayoutTemplate className="w-3.5 h-3.5" /> Define a template first</Button>
                </Link>
              ) : (
                <Link href="/assets/new">
                  <Button variant="default"><Plus className="w-3.5 h-3.5" /> New asset</Button>
                </Link>
              )
            }
          />
        ) : (
          <div className="flex flex-col gap-6 max-w-6xl">
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
    <section className="rounded-lg border bg-card shadow-sm overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b bg-muted/40">
        <div className="min-w-0 flex items-center gap-2">
          <LayoutTemplate className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={1.8} />
          {template ? (
            <Link
              href={`/templates/${encodeURIComponent(template.id)}`}
              className="text-[13px] font-semibold tracking-tight text-foreground hover:underline truncate"
            >
              {template.name}
            </Link>
          ) : (
            <span className="text-[13px] font-semibold tracking-tight text-amber-700 truncate">
              {templateId} <span className="font-normal text-amber-700/70">(template missing)</span>
            </span>
          )}
          <span className="text-[11px] font-mono text-muted-foreground/70 truncate">{templateId}</span>
          {template?.category ? (
            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground/80">
              {template.category}
            </span>
          ) : null}
        </div>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {assets.length} {assets.length === 1 ? "asset" : "assets"}
        </span>
      </header>
      <div className="grid grid-cols-[2fr_3fr_120px_24px] gap-3 px-4 py-2 text-[10.5px] uppercase tracking-wider text-muted-foreground font-medium border-b bg-muted/15">
        <div>Name</div>
        <div className="font-mono text-[10px] normal-case tracking-normal">
          {previewFields.length > 0 ? previewFields.join(" · ") : "(no fields)"}
        </div>
        <div className="text-right">Updated</div>
        <div />
      </div>
      <div className="divide-y">
        {assets.map((a) => (
          <AssetRow key={a.id} asset={a} previewFields={previewFields} />
        ))}
      </div>
    </section>
  );
}

function AssetRow({ asset, previewFields }: { asset: Asset; previewFields: string[] }) {
  const previewValues = previewFields.map((f) => formatValue(asset.values[f])).join(" · ");
  return (
    <Link
      href={`/assets/${encodeURIComponent(asset.id)}`}
      className="grid grid-cols-[2fr_3fr_120px_24px] gap-3 px-4 py-3 items-center group/asset hover:bg-muted/30 transition-colors"
    >
      <div className="min-w-0">
        <div className="text-[13px] font-medium truncate text-foreground">
          {asset.name ?? asset.id}
        </div>
        <div className="text-[11px] font-mono truncate text-muted-foreground/70">{asset.id}</div>
      </div>
      <div className="font-mono text-[12px] truncate text-muted-foreground/90">
        {previewValues || "—"}
      </div>
      <div className="text-[11px] text-right text-muted-foreground">
        {asset.updatedAt ? new Date(asset.updatedAt).toLocaleDateString() : "—"}
      </div>
      <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover/asset:text-muted-foreground transition-colors" />
    </Link>
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
