import Link from "next/link";
import { Plus, Database, Columns3, Rows3 } from "lucide-react";
import { requireWorkspace } from "@/lib/server/require-workspace";
import { listReferences } from "@/lib/server/workspace";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ReferenceSet } from "@/lib/types";

export default async function ReferencesPage() {
  const root = await requireWorkspace();
  const references = await listReferences(root);

  // Group by category (unset → "General"); "General" sorts last.
  const groups = new Map<string, ReferenceSet[]>();
  for (const r of references) {
    const c = (r.category && r.category.trim()) || "General";
    const arr = groups.get(c);
    if (arr) arr.push(r);
    else groups.set(c, [r]);
  }
  const groupList = [...groups.entries()].sort((a, b) => {
    if (a[0] === "General") return 1;
    if (b[0] === "General") return -1;
    return a[0].localeCompare(b[0]);
  });
  const singleGeneral = groupList.length === 1 && groupList[0][0] === "General";

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
      <div className="flex-1 overflow-auto" style={{ padding: "8px 28px 80px", background: "var(--bg)" }}>
        <style>{`
          .rf-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(248px,1fr));gap:12px}
          .rf-card{border:1px solid var(--border);border-radius:12px;background:var(--panel);padding:14px 15px;display:flex;flex-direction:column;gap:9px;min-height:116px;transition:border-color .12s, box-shadow .12s, transform .12s}
          .rf-card:hover{border-color:var(--accent);box-shadow:var(--shadow-sm);transform:translateY(-1px)}
        `}</style>
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
          <div className="flex flex-col" style={{ gap: 26 }}>
            {groupList.map(([cat, refs]) => (
              <section key={cat}>
                {!singleGeneral ? (
                  <div className="flex items-center gap-2" style={{ marginBottom: 11 }}>
                    <Database className="w-4 h-4" style={{ color: "var(--text-muted)" }} strokeWidth={1.8} />
                    <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text)" }}>{cat}</span>
                    <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>
                      {refs.length} {refs.length === 1 ? "set" : "sets"}
                    </span>
                  </div>
                ) : null}
                <div className="rf-grid">
                  {refs.map((ref) => {
                    const cols = ref.columns ?? [];
                    const colPreview = cols.slice(0, 4).join(", ") + (cols.length > 4 ? ` +${cols.length - 4}` : "");
                    return (
                      <Link key={ref.id} href={`/references/${encodeURIComponent(ref.id)}`} className="rf-card">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate" style={{ fontWeight: 600, fontSize: 13.5, letterSpacing: "-0.01em", color: "var(--text)" }}>
                              {ref.name}
                            </div>
                            <div className="mono truncate" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{ref.id}</div>
                          </div>
                          <Database className="w-4 h-4" style={{ color: "var(--text-faint)", flexShrink: 0 }} strokeWidth={1.8} />
                        </div>
                        <div className="mono truncate" style={{ fontSize: 11.5, color: "var(--text-dim)" }} title={cols.join(", ")}>
                          {cols.length ? colPreview : "no columns"}
                        </div>
                        <div className="flex items-center gap-3" style={{ marginTop: "auto", paddingTop: 2, fontSize: 11, color: "var(--text-muted)" }}>
                          <span className="flex items-center gap-1"><Columns3 className="w-3 h-3" /> {cols.length}</span>
                          <span className="flex items-center gap-1"><Rows3 className="w-3 h-3" /> {(ref.rows ?? []).length}</span>
                          <span className="mono">v{ref.currentVersion ?? 1}</span>
                          <span style={{ marginLeft: "auto", color: "var(--text-faint)" }}>
                            {ref.updatedAt ? new Date(ref.updatedAt).toLocaleDateString() : ""}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
