import Link from "next/link";
import { Plus, LayoutTemplate } from "lucide-react";
import { requireWorkspace } from "@/lib/server/require-workspace";
import { listTemplates } from "@/lib/server/workspace";
import { PageHeader } from "@/components/ui/PageHeader";
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
            <button className="btn primary">
              <Plus className="w-3.5 h-3.5" /> New template
            </button>
          </Link>
        }
      />
      <div
        className="flex-1 overflow-auto"
        style={{ padding: "8px 28px 80px", background: "var(--bg)" }}
      >
        {templates.length === 0 ? (
          <EmptyState
            icon={<LayoutTemplate className="w-8 h-8" />}
            title="No output templates yet"
            description="Templates capture the shape of repeating output objects (a bag-fee line, a tax line, a discount line). Once defined, a rule can fill one in field-by-field rather than typing the whole object as a literal each time."
            action={
              <Link href="/templates/new">
                <button className="btn primary">
                  <Plus className="w-3.5 h-3.5" /> New template
                </button>
              </Link>
            }
          />
        ) : (
          <div className="flex flex-col" style={{ gap: 18 }}>
            {Array.from(groups.entries()).map(([category, items]) => (
              <section key={category} className="tbl-wrap">
                <div
                  style={{
                    padding: "10px 14px",
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.07em",
                    color: "var(--text-muted)",
                    fontWeight: 600,
                    background: "var(--panel-2)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  {category}
                </div>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Description</th>
                      <th className="num" style={{ width: 80 }}>Fields</th>
                      <th style={{ width: 120 }}>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((t) => (
                      <tr key={t.id} style={{ cursor: "pointer" }}>
                        <td>
                          <Link href={`/templates/${encodeURIComponent(t.id)}`} style={{ display: "block" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                              <span className="mono" style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                                {t.id}
                              </span>
                              <span style={{ fontWeight: 500, color: "var(--text)" }}>{t.name}</span>
                            </div>
                          </Link>
                        </td>
                        <td style={{ color: "var(--text-dim)" }}>{t.description ?? "—"}</td>
                        <td className="num mono">{t.fieldCount}</td>
                        <td className="muted">
                          {t.updatedAt ? new Date(t.updatedAt).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
