"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Check, X, Database } from "lucide-react";
import { useReferencesStore } from "@/lib/store/references-store";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PortBinding } from "@/lib/types";

type Props = {
  value: Extract<PortBinding, { kind: "ref-select" }>;
  onChange: (next: Extract<PortBinding, { kind: "ref-select" }>) => void;
};

/**
 * Authoring control for the "ref-select" binding kind.
 *
 * Lets the user say things like "destinations where country = US" or "pax
 * types where category = paying" by picking rows from a reference table
 * instead of hand-typing the resulting array.
 *
 *   1. Pick the reference table
 *   2. Pick which column's values become the resolved literal (valueColumn)
 *   3. Optionally filter rows by some other column (whereColumn / whereValues)
 *   4. Live preview of the resulting array
 */
export function ReferenceMultiSelect({ value, onChange }: Props) {
  const refs = useReferencesStore((s) => s.references);
  const loaded = useReferencesStore((s) => s.loaded);
  const load = useReferencesStore((s) => s.load);
  const [whereOpen, setWhereOpen] = useState(false);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const ref = refs.find((r) => r.id === value.referenceId);

  // Auto-pick first column if none selected once a ref is chosen
  useEffect(() => {
    if (ref && !value.valueColumn && ref.columns.length > 0) {
      onChange({ ...value, valueColumn: ref.columns[0] });
    }
  }, [ref, value, onChange]);

  // Compute distinct values for the where-column (so the user can multi-select them)
  const distinctWhereValues = useMemo(() => {
    if (!ref || !value.whereColumn) return [];
    const set = new Set<string>();
    for (const row of ref.rows) {
      const v = row[value.whereColumn];
      if (v !== null && v !== undefined) set.add(String(v));
    }
    return Array.from(set).sort();
  }, [ref, value.whereColumn]);

  // Compute resolved values (the live preview)
  const resolved = useMemo(() => {
    if (!ref || !value.valueColumn) return [];
    const wantedSet = value.whereValues && value.whereValues.length > 0 ? new Set(value.whereValues) : null;
    const out: string[] = [];
    for (const row of ref.rows) {
      if (value.whereColumn && wantedSet) {
        const cell = row[value.whereColumn];
        if (!wantedSet.has(String(cell))) continue;
      }
      const v = row[value.valueColumn];
      if (v !== null && v !== undefined) out.push(String(v));
    }
    return out;
  }, [ref, value.valueColumn, value.whereColumn, value.whereValues]);

  return (
    <div className="flex flex-col gap-2">
      {/* Step 1: pick the ref table */}
      <div className="grid grid-cols-[80px_1fr] gap-2 items-center">
        <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-medium">Source</span>
        <Select
          value={value.referenceId}
          onChange={(e) => onChange({ ...value, referenceId: e.target.value, valueColumn: "", whereColumn: undefined, whereValues: undefined })}
        >
          <option value="">— choose a reference table —</option>
          {refs.map((r) => (
            <option key={r.id} value={r.id}>{r.name} ({r.id})</option>
          ))}
        </Select>
      </div>

      {ref ? (
        <>
          {/* Step 2: pick the value column */}
          <div className="grid grid-cols-[80px_1fr] gap-2 items-center">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-medium">Take values from</span>
            <Select
              value={value.valueColumn}
              onChange={(e) => onChange({ ...value, valueColumn: e.target.value })}
            >
              {ref.columns.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </div>

          {/* Step 3: optional where filter */}
          <div className="grid grid-cols-[80px_1fr] gap-2 items-center">
            <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-medium">Filter by</span>
            <Select
              value={value.whereColumn ?? ""}
              onChange={(e) => {
                const next = e.target.value || undefined;
                onChange({ ...value, whereColumn: next, whereValues: next ? [] : undefined });
              }}
            >
              <option value="">— no filter, take all rows —</option>
              {ref.columns.filter((c) => c !== value.valueColumn).map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </div>

          {/* Step 4: pick the values to filter on */}
          {value.whereColumn ? (
            <div className="grid grid-cols-[80px_1fr] gap-2 items-start">
              <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-medium pt-1.5">where {value.whereColumn} =</span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setWhereOpen((o) => !o)}
                  className="w-full text-left flex items-center gap-1 px-2 py-1.5 rounded border border-border bg-background hover:border-foreground/30 transition-colors text-[12px]"
                >
                  <span className="flex-1 truncate">
                    {value.whereValues?.length
                      ? value.whereValues.join(", ")
                      : <span className="text-muted-foreground italic">pick one or many…</span>}
                  </span>
                  <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", whereOpen && "rotate-180")} />
                </button>

                {whereOpen ? (
                  <div className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-auto rounded-md border bg-popover shadow-lg">
                    {distinctWhereValues.length === 0 ? (
                      <div className="px-3 py-2 text-[11.5px] text-muted-foreground italic">No values in this column.</div>
                    ) : (
                      distinctWhereValues.map((v) => {
                        const checked = value.whereValues?.includes(v) ?? false;
                        return (
                          <button
                            key={v}
                            type="button"
                            onClick={() => {
                              const cur = value.whereValues ?? [];
                              const next = checked ? cur.filter((x) => x !== v) : [...cur, v];
                              onChange({ ...value, whereValues: next });
                            }}
                            className={cn(
                              "w-full text-left flex items-center gap-2 px-2.5 py-1.5 text-[12px] transition-colors",
                              checked ? "bg-muted/60" : "hover:bg-muted/40",
                            )}
                          >
                            <span className={cn(
                              "w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0",
                              checked ? "bg-foreground border-foreground text-background" : "border-border",
                            )}>
                              {checked ? <Check className="w-2.5 h-2.5" /> : null}
                            </span>
                            <span className="truncate">{v}</span>
                          </button>
                        );
                      })
                    )}
                    {value.whereValues?.length ? (
                      <div className="px-2 py-1.5 border-t bg-muted/30 flex items-center justify-between">
                        <span className="text-[10.5px] text-muted-foreground">
                          {value.whereValues.length} selected
                        </span>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => onChange({ ...value, whereValues: [] })}
                        >
                          Clear
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Live preview */}
          <div className="rounded-md border bg-muted/30 px-3 py-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-medium inline-flex items-center gap-1.5">
                <Database className="w-3 h-3" />
                Resolves to
              </span>
              <span className="text-[10.5px] text-muted-foreground tabular-nums">{resolved.length} {resolved.length === 1 ? "value" : "values"}</span>
            </div>
            {resolved.length === 0 ? (
              <div className="text-[11.5px] text-muted-foreground italic">No rows match — pick a value column or relax the filter.</div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {resolved.slice(0, 24).map((v, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-1.5 h-5 rounded text-[10.5px] font-mono bg-background border border-border text-foreground"
                  >
                    {v}
                  </span>
                ))}
                {resolved.length > 24 ? (
                  <span className="inline-flex items-center px-1.5 h-5 rounded text-[10.5px] font-mono bg-background border border-dashed border-border text-muted-foreground">
                    +{resolved.length - 24} more
                  </span>
                ) : null}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
