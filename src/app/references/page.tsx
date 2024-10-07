import Link from "next/link";
import { Plus, Database } from "lucide-react";
import { requireWorkspace } from "@/lib/server/require-workspace";
import { listReferences } from "@/lib/server/workspace";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function ReferencesPage() {
  const root = await requireWorkspace();
  const references = await listReferences(root);

  return (
    <>
      <PageHeader
        title="References"
        description="Reference sets are versioned tabular lookups (price matrices, tax rates, etc.). Mutator nodes use them via lookup-and-replace."
        actions={
          <Link href="/references/new">
            <Button variant="default">
              <Plus className="w-3.5 h-3.5" /> New reference
            </Button>
          </Link>
        }
      />
      <div className="flex-1 overflow-auto px-8 py-6">
        {references.length === 0 ? (
          <EmptyState
            icon={<Database className="w-8 h-8" />}
            title="No reference sets yet"
            description="Create a reference set to back lookup-and-replace mutators. Each set has columns and rows; lookups match on column values and replace a target field with another column's value."
            action={<Link href="/references/new"><Button variant="default"><Plus className="w-3.5 h-3.5" /> New reference</Button></Link>}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[2fr_2fr_0.6fr_0.6fr_auto] gap-3 px-3 text-[11px] uppercase tracking-wider" style={{ color: "var(--color-fg-dim)" }}>
              <div>Name</div>
              <div>Columns</div>
              <div>Rows</div>
              <div>Version</div>
              <div className="text-right">Updated</div>
            </div>
            {references.map((ref) => (
              <Link
                key={ref.id}
                href={`/references/${encodeURIComponent(ref.id)}`}
                className="grid grid-cols-[2fr_2fr_0.6fr_0.6fr_auto] gap-3 px-3 py-3 rounded items-center"
                style={{ background: "var(--color-bg)", border: "1px solid var(--color-border)" }}
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-medium truncate">{ref.name}</div>
                  <div className="text-[11px] mono truncate" style={{ color: "var(--color-fg-muted)" }}>{ref.id}</div>
                </div>
                <div className="mono text-[12px] truncate" style={{ color: "var(--color-fg-soft)" }}>
                  {(ref.columns ?? []).join(", ")}
                </div>
                <div className="text-[12px]">{(ref.rows ?? []).length}</div>
                <div className="text-[12px]">v{ref.currentVersion ?? 1}</div>
                <div className="text-[11px] text-right" style={{ color: "var(--color-fg-muted)" }}>
                  {ref.updatedAt ? new Date(ref.updatedAt).toLocaleDateString() : "—"}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
