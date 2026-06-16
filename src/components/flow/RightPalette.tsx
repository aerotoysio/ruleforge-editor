"use client";

import { useEffect, useMemo, useState } from "react";
import { GripVertical, AlertTriangle, Database, Search, X } from "lucide-react";
import Link from "next/link";
import { useNodesStore } from "@/lib/store/nodes-store";
import { useReferencesStore } from "@/lib/store/references-store";
import type { NodeDef, NodeCategory, ReferenceSet } from "@/lib/types";
import { cn } from "@/lib/utils";

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
  "join",
  "filterList",
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
  textParse: "Data flow",
  calc: "Compute",
  reference: "Compute",
  iterator: "Iteration",
  merge: "Iteration",
  sort: "Array transform",
  limit: "Array transform",
  distinct: "Array transform",
  groupBy: "Array transform",
  join: "Array transform",
  filterList: "Array transform",
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
    const visible = nodes.filter((n) => !n.hidden);
    if (!q) return visible;
    return visible.filter((n) =>
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
    <aside className="palette-rail">
      <header className="palette-head">
        <div>
          <span className="title">Add nodes</span>
          <span className="subtitle">Drag onto canvas</span>
        </div>
        <Link href="/nodes" className="manage-link">
          Manage
        </Link>
      </header>

      <div className="palette-search">
        <Search className="lead" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search nodes…"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="clear-btn"
            title="Clear search"
            aria-label="Clear search"
          >
            <X className="w-3 h-3" />
          </button>
        ) : null}
      </div>

      <div className="palette-body">
        {!loaded ? (
          <div className="palette-empty">Loading library…</div>
        ) : nodes.length === 0 ? (
          <div className="palette-empty">
            No nodes in library.{" "}
            <Link href="/nodes" style={{ color: "var(--accent)", textDecoration: "underline" }}>
              Add some
            </Link>
          </div>
        ) : (
          <>
            {grouped.map(({ name, defs }) => (
              <div key={name} className="palette-section">
                <div className="palette-section-head">{name}</div>
                <div className="palette-section-list">
                  {defs.map((def) => (
                    <PaletteTile key={def.id} def={def} />
                  ))}
                </div>
              </div>
            ))}

            {/* References — drag a table onto the canvas to create a pre-wired lookup */}
            {filteredRefs.length > 0 ? (
              <div className="palette-section">
                <div className="palette-section-head">
                  <Database className="w-2.5 h-2.5" />
                  Reference data
                </div>
                <div className="palette-section-list">
                  {filteredRefs.map((r) => (
                    <ReferenceTile key={r.id} refSet={r} />
                  ))}
                </div>
              </div>
            ) : null}

            {/* No-results state when filter is active and nothing matches */}
            {q && grouped.length === 0 && filteredRefs.length === 0 ? (
              <div className="palette-empty">
                Nothing matches &ldquo;{query}&rdquo;.
              </div>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}

function ReferenceTile({ refSet: r }: { refSet: ReferenceSet }) {
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
      className="palette-tile"
      title={`${r.name} — drag onto the canvas to create a pre-wired lookup node`}
    >
      <GripVertical className="grip" />
      <span
        className="badge"
        style={{ background: "var(--text-muted)", paddingInline: 6 }}
      >
        <Database className="w-2.5 h-2.5" />
      </span>
      <div className="body">
        <div className="tile-name">{r.name}</div>
        <div className="tile-desc">{r.rows.length} rows · {r.columns.join(" · ")}</div>
      </div>
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
      className={cn("palette-tile", unsupported && "unsupported")}
      title={`${def.name} — drag onto the canvas${unsupported ? " (pending engine support)" : ""}`}
    >
      <GripVertical className="grip" />
      <span
        className="badge"
        style={{ background: accent, paddingInline: 6, minWidth: 26 }}
      >
        {def.ui?.badge ?? "?"}
      </span>
      <div className="body">
        <div className="tile-name">
          <span>{def.name}</span>
          {unsupported ? (
            <AlertTriangle className="tile-warn" aria-label="Pending engine support" />
          ) : null}
        </div>
        {def.description ? <div className="tile-desc">{def.description}</div> : null}
      </div>
    </div>
  );
}
