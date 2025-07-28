"use client";

import { useEffect, useMemo, useState } from "react";
import { GripVertical, AlertTriangle, Database, Search, X } from "lucide-react";
import Link from "next/link";
import { useNodesStore } from "@/lib/store/nodes-store";
import { useReferencesStore } from "@/lib/store/references-store";
import type { NodeDef, NodeCategory, ReferenceSet } from "@/lib/types";

export type PaletteDragPayload =
  | { kind: "node"; nodeId: string }
  /**
   * Dropping a reference table onto the canvas creates a pre-wired
   * node-mutator-lookup instance with referenceId already bound. The user
   * just needs to fill in target/valueColumn/matchOn — they don't have
   * to remember which ref-id to type.
   */
  | { kind: "reference"; referenceId: string };

export const PALETTE_DND_TYPE = "application/x-ruleforge-palette";

// Engine support status — tracks categories the engine has not yet wired up.
// As of ENGINE_CAPABILITIES.md (post-production-grade bundle) all 20 ship.
const UNSUPPORTED_CATEGORIES: NodeCategory[] = [];

// Palette ordering — Decision and Data-flow groups float to the top; less-
// common categories (array transforms, external) sit lower so they don't crowd
// the everyday filter / mutator workflow.
const GROUP_ORDER: NodeCategory[] = [
  "input",
  "output",
  "filter",
  "logic",
  "switch",
  "assert",
  "bucket",
  "constant",
  "product",
  "mutator",
  "calc",
  "reference",
  "iterator",
  "merge",
  "sort",
  "limit",
  "distinct",
  "groupBy",
  "api",
  "ruleRef",
];

const GROUP_LABEL: Record<NodeCategory, string> = {
  input: "Terminals",
  output: "Terminals",
  filter: "Decision",
  logic: "Decision",
  switch: "Decision",
  assert: "Decision",
  bucket: "Decision",
  constant: "Data flow",
  product: "Data flow",
  mutator: "Data flow",
  calc: "Compute",
  reference: "Compute",
  iterator: "Iteration",
  merge: "Iteration",
  sort: "Array transform",
  limit: "Array transform",
  distinct: "Array transform",
  groupBy: "Array transform",
  api: "External",
  ruleRef: "Composition",
};

export function RightPalette() {
  const nodes = useNodesStore((s) => s.nodes);
  const loaded = useNodesStore((s) => s.loaded);
  const refs = useReferencesStore((s) => s.references);
  const refsLoaded = useReferencesStore((s) => s.loaded);
  const loadRefs = useReferencesStore((s) => s.load);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!refsLoaded) loadRefs();
  }, [refsLoaded, loadRefs]);

  const q = query.trim().toLowerCase();
  const filteredNodes = useMemo(() => {
    if (!q) return nodes;
    return nodes.filter((n) =>
      n.name.toLowerCase().includes(q)
      || n.description?.toLowerCase().includes(q)
      || n.tags?.some((t) => t.toLowerCase().includes(q))
      || n.category.toLowerCase().includes(q),
    );
  }, [nodes, q]);

  const filteredRefs = useMemo(() => {
    if (!q) return refs;
    return refs.filter((r) =>
      r.name.toLowerCase().includes(q)
      || r.id.toLowerCase().includes(q)
      || r.description?.toLowerCase().includes(q),
    );
  }, [refs, q]);

  const grouped = useMemo(() => {
    const byGroup = new Map<string, NodeDef[]>();
    for (const cat of GROUP_ORDER) byGroup.set(GROUP_LABEL[cat], []);
    for (const def of filteredNodes) {
      const groupName = GROUP_LABEL[def.category] ?? "Other";
      const arr = byGroup.get(groupName) ?? [];
      arr.push(def);
      byGroup.set(groupName, arr);
    }
    // Preserve group order, drop empty groups
    const out: { name: string; defs: NodeDef[] }[] = [];
    const seen = new Set<string>();
    for (const cat of GROUP_ORDER) {
      const name = GROUP_LABEL[cat];
      if (seen.has(name)) continue;
      seen.add(name);
      const defs = byGroup.get(name) ?? [];
      if (defs.length) out.push({ name, defs: defs.sort((a, b) => a.name.localeCompare(b.name)) });
    }
    return out;
  }, [filteredNodes]);

  return (
    <aside className="w-64 shrink-0 flex flex-col border-l bg-muted/20 overflow-hidden">
      <header className="px-3 h-14 shrink-0 flex items-center justify-between border-b bg-background">
        <div className="flex flex-col leading-tight">
          <span className="text-[13px] font-semibold tracking-tight text-foreground">Add nodes</span>
          <span className="text-[10px] text-muted-foreground">Drag onto canvas</span>
        </div>
        <Link
          href="/nodes"
          className="text-[10.5px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors font-medium"
        >
          Manage
        </Link>
      </header>

      <div className="px-3 py-2 border-b bg-background shrink-0">
        <div className="relative">
          <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search nodes…"
            className="w-full h-7 text-[12px] pl-7 pr-7 rounded-md border border-border bg-muted/30 focus:bg-background focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 inline-flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground"
              title="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-auto py-3">
        {!loaded ? (
          <div className="px-4 text-[11px] text-muted-foreground">Loading library…</div>
        ) : nodes.length === 0 ? (
          <div className="mx-2 px-3 py-3 text-[11px] text-muted-foreground rounded-md border border-dashed bg-card">
            No nodes in library.{" "}
            <Link href="/nodes" className="underline text-foreground hover:no-underline">
              Add some
            </Link>
          </div>
        ) : (
          <>
            {grouped.map(({ name, defs }) => (
              <div key={name} className="mb-2">
                <SectionHeader>{name}</SectionHeader>
                <div className="flex flex-col gap-1.5 px-2">
                  {defs.map((def) => (
                    <PaletteTile key={def.id} def={def} />
                  ))}
                </div>
              </div>
            ))}

            {/* References — drag a table onto the canvas to create a pre-wired lookup */}
            {filteredRefs.length > 0 ? (
              <div className="mb-2">
                <SectionHeader>
                  <span className="inline-flex items-center gap-1.5">
                    <Database className="w-2.5 h-2.5" />
                    Reference data
                  </span>
                </SectionHeader>
                <div className="flex flex-col gap-1.5 px-2">
                  {filteredRefs.map((r) => (
                    <ReferenceTile key={r.id} ref={r} />
                  ))}
                </div>
              </div>
            ) : null}

            {/* No-results state when filter is active and nothing matches */}
            {q && grouped.length === 0 && filteredRefs.length === 0 ? (
              <div className="mx-2 px-3 py-3 text-[11.5px] text-muted-foreground rounded-md border border-dashed bg-card">
                Nothing matches &ldquo;{query}&rdquo;.
              </div>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}

function ReferenceTile({ ref: r }: { ref: ReferenceSet }) {
  function onDragStart(e: React.DragEvent<HTMLDivElement>) {
    const payload: PaletteDragPayload = { kind: "reference", referenceId: r.id };
    const json = JSON.stringify(payload);
    e.dataTransfer.setData(PALETTE_DND_TYPE, json);
    e.dataTransfer.setData("text/plain", json);
    e.dataTransfer.effectAllowed = "copy";
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="group grid grid-cols-[auto_1fr_auto] gap-2 items-center px-2 py-2 rounded-md cursor-grab active:cursor-grabbing select-none bg-card border border-border hover:border-foreground/30 hover:shadow-sm transition-all"
      title={`${r.name} — drag onto the canvas to create a pre-wired lookup node`}
    >
      <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
      <div className="min-w-0">
        <div className="text-[12.5px] font-medium leading-tight truncate text-foreground">{r.name}</div>
        <div className="text-[10.5px] truncate text-muted-foreground mt-0.5">
          {r.rows.length} rows · {r.columns.join(" · ")}
        </div>
      </div>
      <span className="inline-flex items-center justify-center w-5 h-5 rounded text-muted-foreground/60">
        <Database className="w-3 h-3" />
      </span>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground/80 font-medium">
      {children}
    </div>
  );
}

function PaletteTile({ def }: { def: NodeDef }) {
  function onDragStart(e: React.DragEvent<HTMLDivElement>) {
    const payload: PaletteDragPayload = { kind: "node", nodeId: def.id };
    const json = JSON.stringify(payload);
    e.dataTransfer.setData(PALETTE_DND_TYPE, json);
    e.dataTransfer.setData("text/plain", json);
    e.dataTransfer.effectAllowed = "copy";
  }

  const accent = def.ui?.accent ?? "#64748b";
  const unsupported = UNSUPPORTED_CATEGORIES.includes(def.category);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={
        "group grid grid-cols-[auto_42px_1fr] gap-2 items-center px-2 py-2 rounded-md cursor-grab active:cursor-grabbing select-none bg-card border transition-all " +
        (unsupported
          ? "border-amber-200 dark:border-amber-900 hover:border-amber-400 hover:shadow-sm"
          : "border-border hover:border-foreground/30 hover:shadow-sm")
      }
      title={`${def.name} — drag onto the canvas${unsupported ? " (pending engine support)" : ""}`}
    >
      <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
      <span
        className="inline-flex items-center justify-center px-1.5 h-5 text-[10px] font-semibold rounded font-mono tracking-wide"
        style={{ background: accent, color: "#fff" }}
      >
        {def.ui?.badge ?? "?"}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-[12.5px] font-medium leading-tight truncate text-foreground">{def.name}</span>
          {unsupported ? (
            <AlertTriangle
              className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400 shrink-0"
              aria-label="Pending engine support"
            />
          ) : null}
        </div>
        {def.description ? (
          <div className="text-[10.5px] truncate text-muted-foreground mt-0.5">{def.description}</div>
        ) : null}
      </div>
    </div>
  );
}
