import Link from "next/link";
import { Plus, Braces } from "lucide-react";
import { requireWorkspace } from "@/lib/server/require-workspace";
import { listSchemaTemplates } from "@/lib/server/workspace";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SeedDemoButton } from "./SeedDemoButton";
import type { SchemaTemplateSummary } from "@/lib/types";

/**
 * Schema templates listing page.
 *
 * Schema templates are reusable JSON Schema shapes — typically inputs — that
 * many rules can share. A rule with `inputSchemaRef` resolves its input shape
 * from one of these on load; the engine never sees the indirection (we inline
 * at compile time). Edit one template → every referencing rule picks up the
 * new shape on next reload.
 */
export default async function SchemasPage() {
  const root = await requireWorkspace();
  const templates = await listSchemaTemplates(root);

  // Group by intent (input/output/context/other) — most workspaces have just
  // a handful of templates so a single flat table per group reads nicely.
  const groups = new Map<string, SchemaTemplateSummary[]>();
  for (const t of templates) {
    const key = intentLabel(t.intent);
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }

  return (
    <>
      <PageHeader
        title="Schemas"
        description="Shared JSON Schema shapes — typically rule inputs. A rule references a schema by id; the editor resolves on load, and the engine sees the inlined shape at runtime. Edit one schema to fan-out the change to every rule that references it."
        actions={
          <div className="flex items-center gap-2">
            <SeedDemoButton hasSchemas={templates.length > 0} />
            <Link href="/schemas/new">
              <button className="btn primary sm">
                <Plus className="w-3.5 h-3.5" /> New schema
              </button>
            </Link>
          </div>
        }
      />
      <div
        className="flex-1 overflow-auto"
        style={{ padding: "8px 28px 80px", background: "var(--bg)" }}
      >
        {templates.length === 0 ? (
          <EmptyState
            icon={<Braces className="w-8 h-8" />}
            title="No schemas yet"
            description="Define a shared input shape once, reference it from any rule. Especially useful when a parent rule and its sub-rules need to speak the same input language — a single schema guarantees shape-compatibility by construction. Or seed a curated demo set to get going fast."
            action={
              <div className="flex items-center gap-2">
                <SeedDemoButton hasSchemas={false} />
                <Link href="/schemas/new">
                  <button className="btn primary">
                    <Plus className="w-3.5 h-3.5" /> New schema
                  </button>
                </Link>
              </div>
            }
          />
        ) : (
          <div className="flex flex-col" style={{ gap: 18 }}>
            {INTENT_ORDER.map((intent) => {
              const items = groups.get(intentLabel(intent)) ?? [];
              if (items.length === 0) return null;
              return (
                <section key={intent ?? "any"} className="tbl-wrap">
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
                    {intentLabel(intent)}
                  </div>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Description</th>
                        <th style={{ width: 110 }}>Category</th>
                        <th className="num" style={{ width: 80 }}>Fields</th>
                        <th className="num" style={{ width: 90 }}>Used by</th>
                        <th style={{ width: 120 }}>Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((t) => (
                        <tr key={t.id} style={{ cursor: "pointer" }}>
                          <td>
                            <Link href={`/schemas/${encodeURIComponent(t.id)}`} style={{ display: "block" }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                                <span className="mono" style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                                  {t.id}
                                </span>
                                <span style={{ fontWeight: 500, color: "var(--text)" }}>{t.name}</span>
                              </div>
                            </Link>
                          </td>
                          <td style={{ color: "var(--text-dim)" }}>{t.description ?? "—"}</td>
                          <td className="muted">{t.category ?? "—"}</td>
                          <td className="num mono">{t.fieldCount}</td>
                          <td className="num mono">
                            {(t.refCount ?? 0) === 0 ? (
                              <span style={{ color: "var(--text-faint)" }}>—</span>
                            ) : (
                              <span style={{ color: "var(--accent)" }}>{t.refCount}</span>
                            )}
                          </td>
                          <td className="muted">
                            {t.updatedAt ? new Date(t.updatedAt).toLocaleDateString() : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

const INTENT_ORDER: (SchemaTemplateSummary["intent"] | undefined)[] = [
  "input",
  "context",
  "output",
  undefined,
];

function intentLabel(intent: SchemaTemplateSummary["intent"] | undefined): string {
  if (intent === "input") return "Input";
  if (intent === "output") return "Output";
  if (intent === "context") return "Context";
  return "Other";
}
