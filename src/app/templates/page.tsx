import Link from "next/link";
import { Plus, LayoutTemplate } from "lucide-react";
import { requireWorkspace } from "@/lib/server/require-workspace";
import { listTemplates } from "@/lib/server/workspace";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function TemplatesPage() {
  const root = await requireWorkspace();
  const templates = await listTemplates(root);

  // Group by category for a scannable list — "ancillary" / "tax" / "discount"
  // / undefined. The list helper already sorts by category then name, so we
  // just walk it once.
  const groups = new Map<string, typeof templates>();
  for (const t of templates) {
    const key = t.category ?? "Other";
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }

  return (
    <>
      <PageHeader
        title="Output templates"
        description="Reusable shapes for the objects a rule emits — bag-fee lines, tax lines, discount lines. A constant or mutator-set node can fill a template field-by-field instead of authoring the whole object as a free-form literal."
        actions={
          <Link href="/templates/new">
            <Button variant="default">
              <Plus className="w-3.5 h-3.5" /> New template
            </Button>
          </Link>
        }
      />
      <div className="flex-1 overflow-auto px-8 py-6">
        {templates.length === 0 ? (
          <EmptyState
            icon={<LayoutTemplate className="w-8 h-8" />}
            title="No output templates yet"
            description="Templates capture the shape of repeating output objects (a bag-fee line, a tax line, a discount line). Once defined, a rule can fill one in field-by-field rather than typing the whole object as a literal each time."
            action={
              <Link href="/templates/new">
                <Button variant="default">
                  <Plus className="w-3.5 h-3.5" /> New template
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="flex flex-col gap-6">
            {Array.from(groups.entries()).map(([category, items]) => (
              <section key={category} className="flex flex-col gap-2">
                <h2 className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground/80 font-semibold px-3">
                  {category}
                </h2>
                <div className="grid grid-cols-[2fr_3fr_0.6fr_auto] gap-3 px-3 text-[11px] uppercase tracking-wider text-muted-foreground/70">
                  <div>Name</div>
                  <div>Description</div>
                  <div>Fields</div>
                  <div className="text-right">Updated</div>
                </div>
                {items.map((t) => (
                  <Link
                    key={t.id}
                    href={`/templates/${encodeURIComponent(t.id)}`}
                    className="grid grid-cols-[2fr_3fr_0.6fr_auto] gap-3 px-3 py-3 rounded items-center bg-card border border-border hover:border-foreground/30 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium truncate text-foreground">{t.name}</div>
                      <div className="text-[11px] font-mono truncate text-muted-foreground">{t.id}</div>
                    </div>
                    <div className="text-[12px] truncate text-muted-foreground/90">
                      {t.description ?? "—"}
                    </div>
                    <div className="text-[12px] tabular-nums">{t.fieldCount}</div>
                    <div className="text-[11px] text-right text-muted-foreground">
                      {t.updatedAt ? new Date(t.updatedAt).toLocaleDateString() : "—"}
                    </div>
                  </Link>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
