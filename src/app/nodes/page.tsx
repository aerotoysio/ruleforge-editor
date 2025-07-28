import Link from "next/link";
import { Plus, Boxes, ArrowUpRight, AlertTriangle } from "lucide-react";
import { requireWorkspace } from "@/lib/server/require-workspace";
import { listNodeDefs } from "@/lib/server/workspace";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { NodeCategory } from "@/lib/types";

// Engine support status — tracks which categories are wired up in the
// engine's evaluator. As of ENGINE_CAPABILITIES.md (post-production-grade
// bundle) all 20 categories ship with an evaluator. Keep this as an empty
// list until the engine deprecates something.
const UNSUPPORTED_CATEGORIES: NodeCategory[] = [];

const GROUP_LABEL: Record<string, string> = {
  input: "Terminals",
  output: "Terminals",
  constant: "Data flow",
  product: "Data flow",
  mutator: "Data flow",
  filter: "Decision",
  logic: "Decision",
  switch: "Decision",
  assert: "Decision",
  bucket: "Decision",
  calc: "Compute",
  reference: "Compute",
  api: "Compute",
  iterator: "Iteration",
  merge: "Iteration",
  sort: "Array transform",
  limit: "Array transform",
  distinct: "Array transform",
  groupBy: "Array transform",
  ruleRef: "Composition",
};

export default async function NodesPage() {
  const root = await requireWorkspace();
  const nodes = await listNodeDefs(root);

  // Group by display group
  const groups = new Map<string, typeof nodes>();
  for (const n of nodes) {
    const group = GROUP_LABEL[n.category] ?? "Other";
    const arr = groups.get(group) ?? [];
    arr.push(n);
    groups.set(group, arr);
  }
  const groupOrder = ["Terminals", "Control flow", "Filters", "Mutators", "Compute", "Composition", "Logic", "Output", "External", "Reference", "Other"];

  return (
    <>
      <PageHeader
        title="Node library"
        description="Reusable node templates — the business intentions you can drag onto rule canvases. Each node declares its ports; per-rule bindings wire those ports to actual schema paths."
        actions={
          <Link href="/nodes/new">
            <Button variant="default" size="sm">
              <Plus className="w-3.5 h-3.5" /> New node
            </Button>
          </Link>
        }
      />
      <div className="flex-1 overflow-auto px-8 py-6 bg-muted/30">
        {nodes.length === 0 ? (
          <EmptyState
            icon={<Boxes className="w-8 h-8" />}
            title="No nodes yet"
            description="The library is empty. Seed nodes are normally provided when the workspace is created."
            action={
              <Link href="/nodes/new">
                <Button variant="default"><Plus className="w-3.5 h-3.5" /> New node</Button>
              </Link>
            }
          />
        ) : (
          <div className="flex flex-col gap-6">
            {groupOrder.map((groupName) => {
              const items = groups.get(groupName);
              if (!items || items.length === 0) return null;
              return (
                <div key={groupName}>
                  <div className="px-1 mb-2 text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground/80 font-medium">
                    {groupName}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {items.sort((a, b) => a.name.localeCompare(b.name)).map((n) => {
                      const unsupported = UNSUPPORTED_CATEGORIES.includes(n.category);
                      const accent = n.ui?.accent ?? "#64748b";
                      return (
                        <Link
                          key={n.id}
                          href={`/nodes/${encodeURIComponent(n.id)}`}
                          className="group rounded-lg p-4 flex flex-col gap-2.5 bg-card border hover:border-foreground/30 hover:shadow-md transition-all"
                        >
                          <div className="flex items-start gap-2.5">
                            <span
                              className="inline-flex items-center justify-center w-9 h-9 rounded-md text-[10px] font-bold font-mono tracking-wide shrink-0"
                              style={{ background: accent, color: "#fff" }}
                            >
                              {n.ui?.badge ?? "?"}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[13px] font-semibold text-foreground truncate">{n.name}</span>
                                {unsupported ? (
                                  <span
                                    className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 h-4 rounded bg-amber-50 text-amber-900 border border-amber-200 font-medium dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900"
                                    title="Engine doesn't yet evaluate this category"
                                  >
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    pending
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-[11px] font-mono text-muted-foreground/70 truncate">{n.id}</div>
                            </div>
                            <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
                          </div>
                          {n.description ? (
                            <p className="text-[12px] text-muted-foreground leading-relaxed line-clamp-2">{n.description}</p>
                          ) : null}
                          <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground/80 flex-wrap">
                            <PortCount label="inputs" count={n.ports.inputs?.length ?? 0} />
                            <PortCount label="params" count={n.ports.params?.length ?? 0} />
                            <PortCount label="outputs" count={n.ports.outputs?.length ?? 0} />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function PortCount({ label, count }: { label: string; count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 h-4 rounded bg-muted/60 text-muted-foreground font-mono">
      <span className="font-semibold tabular-nums">{count}</span>
      <span>{label}</span>
    </span>
  );
}
