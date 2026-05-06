"use client";

import { useMemo } from "react";
import { GripVertical, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useNodesStore } from "@/lib/store/nodes-store";
import type { NodeDef, NodeCategory } from "@/lib/types";

export type PaletteDragPayload = { kind: "node"; nodeId: string };

export const PALETTE_DND_TYPE = "application/x-ruleforge-palette";

// Engine team flagged: these categories are declared but currently throw
// NotSupportedException at evaluation time. The editor lets you author against
// them, but we surface a "pending" indicator so business users aren't surprised
// when the rule won't run.
const UNSUPPORTED_CATEGORIES: NodeCategory[] = ["api", "sql", "product", "reference", "logic"];

const GROUP_ORDER: NodeCategory[] = [
  "input",
  "output",
  "iterator",
  "merge",
  "filter",
  "mutator",
  "calc",
  "constant",
  "ruleRef",
  "logic",
  "product",
  "reference",
  "sql",
  "api",
];

const GROUP_LABEL: Record<NodeCategory, string> = {
  input: "Terminals",
  output: "Terminals",
  iterator: "Control flow",
  merge: "Control flow",
  filter: "Filters",
  mutator: "Mutators",
  calc: "Compute",
  constant: "Compute",
  ruleRef: "Composition",
  logic: "Logic",
  product: "Output",
  reference: "Reference",
  sql: "External",
  api: "External",
};

export function RightPalette() {
  const nodes = useNodesStore((s) => s.nodes);
  const loaded = useNodesStore((s) => s.loaded);

  const grouped = useMemo(() => {
    const byGroup = new Map<string, NodeDef[]>();
    for (const cat of GROUP_ORDER) byGroup.set(GROUP_LABEL[cat], []);
    for (const def of nodes) {
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
  }, [nodes]);

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
          grouped.map(({ name, defs }) => (
            <div key={name} className="mb-2">
              <SectionHeader>{name}</SectionHeader>
              <div className="flex flex-col gap-1.5 px-2">
                {defs.map((def) => (
                  <PaletteTile key={def.id} def={def} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
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
