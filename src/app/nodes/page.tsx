import Link from "next/link";
import { Plus, Boxes, ArrowUpRight, AlertTriangle, Filter as FilterIcon } from "lucide-react";
import { requireWorkspace } from "@/lib/server/require-workspace";
import { listNodeDefs } from "@/lib/server/workspace";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import type { NodeCategory, NodeDef } from "@/lib/types";

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

// Chips for one-click category filtering. Order matches the cognitive walk
// through a rule: terminals → decisions → data flow → compute → array → comp.
const CATEGORY_CHIPS: { value: NodeCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "filter", label: "Filters" },
  { value: "mutator", label: "Mutators" },
  { value: "logic", label: "Logic" },
  { value: "switch", label: "Switch" },
  { value: "assert", label: "Assert" },
  { value: "calc", label: "Calc" },
  { value: "reference", label: "Reference" },
  { value: "iterator", label: "Iterator" },
  { value: "merge", label: "Merge" },
  { value: "api", label: "API" },
  { value: "ruleRef", label: "Sub-rules" },
];

type SearchParams = Promise<{ category?: string }>;

export default async function NodesPage({ searchParams }: { searchParams: SearchParams }) {
  const root = await requireWorkspace();
  const allNodes = await listNodeDefs(root);
  const { category } = await searchParams;
  const activeCategory = (category && category !== "all" ? category : null) as NodeCategory | null;

  // Filter by ?category if given. "filter" matches every node-filter-* —
  // includes the base + all derived variants — so the "Filters" sidebar
  // shortcut lands on the right page out of the box.
  const nodes = activeCategory
    ? allNodes.filter((n) => n.category === activeCategory)
    : allNodes;

  // Group by display group
  const groups = new Map<string, NodeDef[]>();
  for (const n of nodes) {
    const group = GROUP_LABEL[n.category] ?? "Other";
    const arr = groups.get(group) ?? [];
    arr.push(n);
    groups.set(group, arr);
  }
  const groupOrder = ["Terminals", "Decision", "Data flow", "Compute", "Iteration", "Array transform", "Composition", "Other"];

  // Customise the page header based on whether a filter is applied.
  const headerTitle =
    activeCategory === "filter" ? "Filters"
    : activeCategory ? `${activeCategory.charAt(0).toUpperCase() + activeCategory.slice(1)} nodes`
    : "Node library";
  const headerDesc =
    activeCategory === "filter"
      ? "Filter nodes ship as definitions in /nodes — both the generic node-filter base and derived variants (string-in, numeric-range, date-window, markets, etc.). Edit a filter's ports, hints, and defaults here; per-rule binding happens on the rule canvas."
      : activeCategory
      ? `Showing nodes in category "${activeCategory}". Edit a node's ports, defaults, and metadata here; per-rule binding happens on the rule canvas.`
      : "Reusable node templates — the business intentions you can drag onto rule canvases. Each node declares its ports; per-rule bindings wire those ports to actual schema paths.";

  return (
    <>
      <PageHeader
        title={headerTitle}
        description={headerDesc}
        actions={
          <Link href="/nodes/new">
            <button className="btn primary sm">
              <Plus className="w-3.5 h-3.5" /> New node
            </button>
          </Link>
        }
      />
      <div
        className="flex-1 overflow-auto"
        style={{ padding: "8px 28px 80px", background: "var(--bg)" }}
      >
        {/* Category chip strip — sticky-ish header between page-head and body. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
            paddingBottom: 16,
          }}
        >
          <FilterIcon
            className="w-3 h-3"
            style={{ color: "var(--text-muted)", marginRight: 4 }}
          />
          {CATEGORY_CHIPS.map((chip) => {
            const isOn = chip.value === "all"
              ? !activeCategory
              : chip.value === activeCategory;
            const href = chip.value === "all" ? "/nodes" : `/nodes?category=${chip.value}`;
            return (
              <Link
                key={chip.value}
                href={href}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 24,
                  padding: "0 10px",
                  borderRadius: 999,
                  fontSize: 11.5,
                  fontWeight: 500,
                  border: "1px solid var(--border)",
                  background: isOn ? "var(--accent)" : "var(--panel-2)",
                  color: isOn ? "var(--accent-fg)" : "var(--text-dim)",
                  borderColor: isOn ? "var(--accent)" : "var(--border)",
                  transition: "border-color 0.12s, background 0.12s, color 0.12s",
                }}
              >
                {chip.label}
              </Link>
            );
          })}
          <span
            style={{
              marginLeft: "auto",
              fontSize: 11,
              color: "var(--text-muted)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {nodes.length} of {allNodes.length} nodes
          </span>
        </div>

        {nodes.length === 0 ? (
          <EmptyState
            icon={<Boxes className="w-8 h-8" />}
            title={activeCategory ? `No ${activeCategory} nodes` : "No nodes yet"}
            description={
              activeCategory
                ? `Nothing in this category in the current workspace. Try switching the chip above, or add one.`
                : "The library is empty. Seed nodes are normally provided when the workspace is created."
            }
            action={
              <Link href="/nodes/new">
                <button className="btn primary"><Plus className="w-3.5 h-3.5" /> New node</button>
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
                      const accent = n.ui?.accent ?? "var(--text-muted)";
                      return (
                        <Link
                          key={n.id}
                          href={`/nodes/${encodeURIComponent(n.id)}`}
                          className="group card-hover p-4 flex flex-col gap-2.5"
                        >
                          <div className="flex items-start gap-2.5">
                            <span
                              className="inline-flex items-center justify-center w-9 h-9 rounded-md mono shrink-0"
                              style={{
                                background: accent,
                                color: "#fff",
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: "0.04em",
                              }}
                            >
                              {n.ui?.badge ?? "?"}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="truncate"
                                  style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}
                                >
                                  {n.name}
                                </span>
                                {unsupported ? (
                                  <span
                                    className="status-badge review"
                                    style={{ fontSize: 10 }}
                                    title="Engine doesn't yet evaluate this category"
                                  >
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    pending
                                  </span>
                                ) : null}
                              </div>
                              <div
                                className="mono truncate"
                                style={{ fontSize: 11, color: "var(--text-muted)" }}
                              >
                                {n.id}
                              </div>
                            </div>
                            <ArrowUpRight
                              className="w-3.5 h-3.5 shrink-0 transition-colors"
                              style={{ color: "var(--text-faint)" }}
                            />
                          </div>
                          {n.description ? (
                            <p
                              className="line-clamp-2"
                              style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}
                            >
                              {n.description}
                            </p>
                          ) : null}
                          <div className="flex items-center gap-1.5 flex-wrap">
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
    <span
      className="inline-flex items-center gap-1 mono"
      style={{
        padding: "0 6px",
        height: 16,
        borderRadius: 4,
        fontSize: 10.5,
        background: "var(--panel-2)",
        color: "var(--text-muted)",
      }}
    >
      <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{count}</span>
      <span>{label}</span>
    </span>
  );
}
