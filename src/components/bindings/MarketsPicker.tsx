"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Minus, X, MapPin, ChevronRight, ChevronDown } from "lucide-react";
import { useReferencesStore } from "@/lib/store/references-store";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PortBinding } from "@/lib/types";

type MarketsBinding = Extract<PortBinding, { kind: "markets-select" }>;

type Props = {
  value: MarketsBinding;
  onChange: (next: MarketsBinding) => void;
};

/**
 * Hierarchical picker for markets-select bindings.
 *
 * Reads any reference table (ref-airports by default) and lets the user
 * compose include/exclude rules across the table's hierarchy columns —
 * e.g. continent → country → state → city — plus single rows.
 *
 * The author sees plain-English groups ("United States", "Texas",
 * "Geneva (GVA)"); the engine sees a structured binding it resolves to a
 * flat array of codes at evaluation time.
 */
export function MarketsPicker({ value, onChange }: Props) {
  const refs = useReferencesStore((s) => s.references);
  const loaded = useReferencesStore((s) => s.loaded);
  const load = useReferencesStore((s) => s.load);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const ref = refs.find((r) => r.id === value.referenceId);

  // Default to ref-airports if no reference is set yet (the canonical case).
  useEffect(() => {
    if (!value.referenceId && refs.length > 0) {
      const airports = refs.find((r) => r.id === "ref-airports") ?? refs[0];
      onChange({ ...value, referenceId: airports.id, valueColumn: "code" });
    }
  }, [refs, value, onChange]);

  if (!ref) {
    return (
      <div className="rounded-md border bg-card p-3 text-[12px] text-muted-foreground">
        Loading reference data…
      </div>
    );
  }

  const hierarchyCols = pickHierarchyColumns(ref.columns);

  return (
    <div className="grid grid-cols-[1fr_300px] gap-3 min-h-[400px]">
      {/* LEFT: Hierarchy tree */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-medium">Source</span>
          <Select
            value={value.referenceId}
            onChange={(e) => {
              const r = refs.find((x) => x.id === e.target.value);
              onChange({ ...value, referenceId: e.target.value, valueColumn: r?.columns[0] ?? "", include: [], exclude: [] });
            }}
            className="flex-1"
          >
            {refs.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </Select>
          <Select
            value={value.valueColumn}
            onChange={(e) => onChange({ ...value, valueColumn: e.target.value })}
            className="w-32"
          >
            {ref.columns.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </div>

        <div className="rounded-md border bg-card overflow-hidden flex-1 max-h-[420px] overflow-auto">
          <HierarchyTree
            ref={ref}
            hierarchyCols={hierarchyCols}
            include={value.include}
            exclude={value.exclude}
            onAddInclude={(rule) => onChange({ ...value, include: dedup(value.include, rule) })}
            onAddExclude={(rule) => onChange({ ...value, exclude: dedup(value.exclude, rule) })}
            onRemoveInclude={(rule) => onChange({ ...value, include: removeRule(value.include, rule) })}
            onRemoveExclude={(rule) => onChange({ ...value, exclude: removeRule(value.exclude, rule) })}
          />
        </div>
      </div>

      {/* RIGHT: Selection summary + resolved preview */}
      <SelectionSummary value={value} ref={ref} onChange={onChange} />
    </div>
  );
}

// ------------------------------------------------------------------
// Hierarchy tree (recursive, lazy-expand)
// ------------------------------------------------------------------

function HierarchyTree({
  ref,
  hierarchyCols,
  include,
  exclude,
  onAddInclude,
  onAddExclude,
  onRemoveInclude,
  onRemoveExclude,
}: {
  ref: import("@/lib/types").ReferenceSet;
  hierarchyCols: string[];
  include: { column: string; value: string }[];
  exclude: { column: string; value: string }[];
  onAddInclude: (r: { column: string; value: string }) => void;
  onAddExclude: (r: { column: string; value: string }) => void;
  onRemoveInclude: (r: { column: string; value: string }) => void;
  onRemoveExclude: (r: { column: string; value: string }) => void;
}) {
  const [filter, setFilter] = useState("");
  const f = filter.trim().toLowerCase();

  // Group rows by the hierarchy columns (continent → country → state → city → code)
  const grouped = useMemo(() => groupByHierarchy(ref.rows, hierarchyCols), [ref.rows, hierarchyCols]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 py-1.5 border-b sticky top-0 bg-card z-10">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search… (e.g. Geneva, Texas, EMEA)"
          className="h-7 text-[11.5px]"
        />
      </div>
      <div className="flex-1 overflow-auto p-1">
        <GroupNode
          group={grouped}
          path={[]}
          hierarchyCols={hierarchyCols}
          filter={f}
          include={include}
          exclude={exclude}
          onAddInclude={onAddInclude}
          onAddExclude={onAddExclude}
          onRemoveInclude={onRemoveInclude}
          onRemoveExclude={onRemoveExclude}
          rootDefaultOpen
        />
      </div>
    </div>
  );
}

type Group = { count: number; children: Map<string, Group>; rows?: Record<string, unknown>[] };

function groupByHierarchy(rows: Record<string, unknown>[], cols: string[]): Group {
  const root: Group = { count: 0, children: new Map() };
  for (const row of rows) {
    let cur = root;
    cur.count++;
    for (const col of cols) {
      const k = String(row[col] ?? "(none)");
      let next = cur.children.get(k);
      if (!next) {
        next = { count: 0, children: new Map() };
        cur.children.set(k, next);
      }
      next.count++;
      cur = next;
    }
    if (!cur.rows) cur.rows = [];
    cur.rows.push(row);
  }
  return root;
}

function GroupNode({
  group,
  path,
  hierarchyCols,
  filter,
  include,
  exclude,
  onAddInclude,
  onAddExclude,
  onRemoveInclude,
  onRemoveExclude,
  rootDefaultOpen = false,
}: {
  group: Group;
  path: { column: string; value: string }[];
  hierarchyCols: string[];
  filter: string;
  include: { column: string; value: string }[];
  exclude: { column: string; value: string }[];
  onAddInclude: (r: { column: string; value: string }) => void;
  onAddExclude: (r: { column: string; value: string }) => void;
  onRemoveInclude: (r: { column: string; value: string }) => void;
  onRemoveExclude: (r: { column: string; value: string }) => void;
  rootDefaultOpen?: boolean;
}) {
  const depth = path.length;
  const colName = hierarchyCols[depth];

  return (
    <div className="flex flex-col">
      {Array.from(group.children.entries()).map(([key, child]) => {
        // Filter check: keep node if its key, any ancestor, or any descendant matches.
        if (filter && !groupMatchesFilter(key, child, filter)) return null;
        const rule = { column: colName, value: key };
        return (
          <GroupRow
            key={`${colName}=${key}`}
            label={key}
            rule={rule}
            count={child.count}
            child={child}
            depth={depth}
            isLeaf={child.children.size === 0}
            include={include}
            exclude={exclude}
            onAddInclude={onAddInclude}
            onAddExclude={onAddExclude}
            onRemoveInclude={onRemoveInclude}
            onRemoveExclude={onRemoveExclude}
            // Render children:
            renderChildren={() => (
              <GroupNode
                group={child}
                path={[...path, rule]}
                hierarchyCols={hierarchyCols}
                filter={filter}
                include={include}
                exclude={exclude}
                onAddInclude={onAddInclude}
                onAddExclude={onAddExclude}
                onRemoveInclude={onRemoveInclude}
                onRemoveExclude={onRemoveExclude}
              />
            )}
            initiallyOpen={rootDefaultOpen && depth === 0}
            forceOpen={!!filter}
          />
        );
      })}
    </div>
  );
}

function groupMatchesFilter(key: string, group: Group, filter: string): boolean {
  if (key.toLowerCase().includes(filter)) return true;
  for (const [k, v] of group.children) {
    if (groupMatchesFilter(k, v, filter)) return true;
  }
  return false;
}

function GroupRow({
  label,
  rule,
  count,
  depth,
  isLeaf,
  include,
  exclude,
  onAddInclude,
  onAddExclude,
  onRemoveInclude,
  onRemoveExclude,
  renderChildren,
  initiallyOpen,
  forceOpen,
}: {
  label: string;
  rule: { column: string; value: string };
  count: number;
  child: Group;
  depth: number;
  isLeaf: boolean;
  include: { column: string; value: string }[];
  exclude: { column: string; value: string }[];
  onAddInclude: (r: { column: string; value: string }) => void;
  onAddExclude: (r: { column: string; value: string }) => void;
  onRemoveInclude: (r: { column: string; value: string }) => void;
  onRemoveExclude: (r: { column: string; value: string }) => void;
  renderChildren: () => React.ReactNode;
  initiallyOpen?: boolean;
  forceOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!initiallyOpen);
  const isOpen = open || forceOpen;
  const isIncluded = include.some((r) => r.column === rule.column && r.value === rule.value);
  const isExcluded = exclude.some((r) => r.column === rule.column && r.value === rule.value);

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 px-1.5 py-1 rounded text-[12px] transition-colors group",
          isIncluded ? "bg-emerald-50 dark:bg-emerald-950/30" : isExcluded ? "bg-red-50 dark:bg-red-950/30" : "hover:bg-muted/40",
        )}
        style={{ paddingLeft: 6 + depth * 14 }}
      >
        {!isLeaf ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="w-4 h-4 inline-flex items-center justify-center text-muted-foreground/60"
          >
            {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        ) : (
          <span className="w-4 h-4 inline-block" />
        )}
        <span className={cn("truncate flex-1", isIncluded ? "text-emerald-900 dark:text-emerald-200 font-medium" : isExcluded ? "text-red-900 dark:text-red-200 line-through" : "text-foreground")}>
          {label}
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground/70 px-1.5">{count}</span>

        {isIncluded ? (
          <button
            type="button"
            onClick={() => onRemoveInclude(rule)}
            className="opacity-100 px-1.5 h-5 inline-flex items-center gap-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-900 hover:bg-emerald-200 dark:bg-emerald-900 dark:text-emerald-100"
            title="Remove from Include"
          >
            <Plus className="w-2.5 h-2.5" /> in
          </button>
        ) : isExcluded ? (
          <button
            type="button"
            onClick={() => onRemoveExclude(rule)}
            className="opacity-100 px-1.5 h-5 inline-flex items-center gap-0.5 rounded text-[10px] font-medium bg-red-100 text-red-900 hover:bg-red-200 dark:bg-red-900 dark:text-red-100"
            title="Remove from Exclude"
          >
            <Minus className="w-2.5 h-2.5" /> out
          </button>
        ) : (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
            <button
              type="button"
              onClick={() => onAddInclude(rule)}
              className="px-1.5 h-5 inline-flex items-center gap-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-900 hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-200"
              title="Include"
            >
              <Plus className="w-2.5 h-2.5" /> in
            </button>
            <button
              type="button"
              onClick={() => onAddExclude(rule)}
              className="px-1.5 h-5 inline-flex items-center gap-0.5 rounded text-[10px] font-medium bg-red-100 text-red-900 hover:bg-red-200 dark:bg-red-950 dark:text-red-200"
              title="Exclude"
            >
              <Minus className="w-2.5 h-2.5" /> out
            </button>
          </div>
        )}
      </div>
      {isOpen && !isLeaf ? <div>{renderChildren()}</div> : null}
    </div>
  );
}

// ------------------------------------------------------------------
// Selection summary + resolved preview
// ------------------------------------------------------------------

function SelectionSummary({
  value,
  ref,
  onChange,
}: {
  value: MarketsBinding;
  ref: import("@/lib/types").ReferenceSet;
  onChange: (next: MarketsBinding) => void;
}) {
  // Resolve: union of include rules, minus exclude rules
  const resolved = useMemo(() => {
    if (!value.valueColumn) return [];
    const includeSet = value.include.length === 0 ? null : value.include;
    let pool = includeSet
      ? ref.rows.filter((row) => includeSet.some((r) => String(row[r.column]) === r.value))
      : [];
    if (value.exclude.length > 0) {
      pool = pool.filter((row) => !value.exclude.some((r) => String(row[r.column]) === r.value));
    }
    return Array.from(new Set(pool.map((row) => String(row[value.valueColumn] ?? ""))));
  }, [value.include, value.exclude, value.valueColumn, ref.rows]);

  return (
    <div className="rounded-md border bg-card flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-2">
        <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-[12.5px] font-semibold text-foreground">Markets</span>
        <span className="text-[10.5px] tabular-nums text-muted-foreground ml-auto">
          {resolved.length} {resolved.length === 1 ? "code" : "codes"}
        </span>
      </div>

      <div className="flex-1 overflow-auto p-2.5 flex flex-col gap-3">
        {/* Include section */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-semibold mb-1.5 inline-flex items-center gap-1">
            <Plus className="w-2.5 h-2.5" /> Include
          </div>
          {value.include.length === 0 ? (
            <div className="text-[11px] text-muted-foreground italic">Click <em>+ in</em> on the tree to add inclusions.</div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {value.include.map((r, i) => (
                <RuleChip
                  key={`${r.column}=${r.value}-${i}`}
                  label={`${r.value}`}
                  hint={r.column}
                  tone="include"
                  onRemove={() => onChange({ ...value, include: value.include.filter((_, j) => j !== i) })}
                />
              ))}
            </div>
          )}
        </div>

        {/* Exclude section */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-red-700 dark:text-red-400 font-semibold mb-1.5 inline-flex items-center gap-1">
            <Minus className="w-2.5 h-2.5" /> Except
          </div>
          {value.exclude.length === 0 ? (
            <div className="text-[11px] text-muted-foreground italic">Click <em>− out</em> on the tree to subtract.</div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {value.exclude.map((r, i) => (
                <RuleChip
                  key={`${r.column}=${r.value}-${i}`}
                  label={`${r.value}`}
                  hint={r.column}
                  tone="exclude"
                  onRemove={() => onChange({ ...value, exclude: value.exclude.filter((_, j) => j !== i) })}
                />
              ))}
            </div>
          )}
        </div>

        {/* Resolved preview */}
        <div className="border-t pt-2.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-semibold mb-1.5">
            Resolves to
          </div>
          {resolved.length === 0 ? (
            <div className="text-[11px] text-muted-foreground italic">
              {value.include.length === 0 ? "Add an inclusion to see results." : "No rows match — relax exclusions?"}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {resolved.slice(0, 32).map((c, i) => (
                <span
                  key={i}
                  className="inline-flex items-center px-1.5 h-5 rounded text-[10.5px] font-mono bg-background border border-border text-foreground"
                >
                  {c}
                </span>
              ))}
              {resolved.length > 32 ? (
                <span className="inline-flex items-center px-1.5 h-5 rounded text-[10.5px] font-mono bg-background border border-dashed border-border text-muted-foreground">
                  +{resolved.length - 32} more
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {(value.include.length > 0 || value.exclude.length > 0) ? (
        <div className="px-2.5 py-1.5 border-t bg-muted/30 flex justify-end">
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onChange({ ...value, include: [], exclude: [] })}
          >
            Clear all
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function RuleChip({
  label,
  hint,
  tone,
  onRemove,
}: {
  label: string;
  hint: string;
  tone: "include" | "exclude";
  onRemove: () => void;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 pl-2 pr-0.5 h-5 rounded text-[10.5px] border",
        tone === "include"
          ? "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900"
          : "bg-red-50 text-red-900 border-red-200 dark:bg-red-950/30 dark:text-red-200 dark:border-red-900",
      )}
    >
      <span className="font-medium">{label}</span>
      <span className="text-[9.5px] opacity-60 font-mono">· {hint}</span>
      <button
        type="button"
        onClick={onRemove}
        className="w-4 h-4 inline-flex items-center justify-center rounded hover:bg-foreground/10"
        title="Remove"
      >
        <X className="w-2.5 h-2.5" />
      </button>
    </span>
  );
}

// ------------------------------------------------------------------
// helpers
// ------------------------------------------------------------------

/** Pick which columns drive the hierarchy tree (heuristic: continent / region / country / state / city / code). */
function pickHierarchyColumns(allCols: string[]): string[] {
  const preferred = ["continent", "region", "country", "state", "city", "code"];
  const picked = preferred.filter((p) => allCols.includes(p));
  if (picked.length >= 2) return picked;
  // Fallback: use the columns in their declared order (excluding lat/lon / numeric-ish).
  return allCols.filter((c) => !["lat", "lon", "latitude", "longitude", "name"].includes(c.toLowerCase()));
}

function dedup<T extends { column: string; value: string }>(arr: T[], item: T): T[] {
  if (arr.some((r) => r.column === item.column && r.value === item.value)) return arr;
  return [...arr, item];
}

function removeRule<T extends { column: string; value: string }>(arr: T[], item: T): T[] {
  return arr.filter((r) => !(r.column === item.column && r.value === item.value));
}
