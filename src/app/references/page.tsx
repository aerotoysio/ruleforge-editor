import Link from "next/link";
import { Plus, Database } from "lucide-react";
import { requireWorkspace } from "@/lib/server/require-workspace";
import { listReferences } from "@/lib/server/workspace";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function ReferencesPage() {
  const root = await requireWorkspace();
  const references = await listReferences(root);

  return (
    <>
      <PageHeader
        title="References"
        description="Versioned tabular lookups (price matrices, tax rates, …). Mutator nodes use them via lookup-and-replace."
        actions={
          <Link href="/references/new">
            <button className="btn primary">
              <Plus className="w-3.5 h-3.5" /> New reference
            </button>
          </Link>
        }
      />
      <div
        className="flex-1 overflow-auto"
        style={{ padding: "8px 28px 80px", background: "var(--bg)" }}
      >
        {references.length === 0 ? (
          <EmptyState
            icon={<Database className="w-8 h-8" />}
            title="No reference sets yet"
            description="Create a reference set to back lookup-and-replace mutators. Each set has columns and rows; lookups match on column values and replace a target field with another column's value."
            action={
              <Link href="/references/new">
                <button className="btn primary">
                  <Plus className="w-3.5 h-3.5" /> New reference
                </button>
              </Link>
            }
          />
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Columns</th>
                  <th className="num" style={{ width: 80 }}>Rows</th>
                  <th className="num" style={{ width: 80 }}>v</th>
                  <th style={{ width: 130 }}>Updated</th>
                </tr>
              </thead>
              <tbody>
                {references.map((ref) => (
                  <tr key={ref.id} style={{ cursor: "pointer" }}>
                    <td>
                      <Link
                        href={`/references/${encodeURIComponent(ref.id)}`}
                        style={{ display: "flex", flexDirection: "column", gap: 1 }}
                      >
                        <span className="mono" style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
                          {ref.id}
                        </span>
                        <span style={{ fontWeight: 500, color: "var(--text)" }}>{ref.name}</span>
                      </Link>
                    </td>
                    <td className="mono" style={{ color: "var(--text-dim)" }}>
                      {(ref.columns ?? []).join(", ")}
                    </td>
                    <td className="num mono">{(ref.rows ?? []).length}</td>
                    <td className="num mono">
                      <span style={{ color: "var(--text-muted)" }}>v</span>
                      {ref.currentVersion ?? 1}
                    </td>
                    <td className="muted">
                      {ref.updatedAt ? new Date(ref.updatedAt).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
