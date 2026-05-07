"use client";

import { useEffect, useMemo } from "react";
import { Database } from "lucide-react";
import { useReferencesStore } from "@/lib/store/references-store";
import { Select } from "@/components/ui/Select";
import { ShuttlePicker, type ShuttleItem } from "./ShuttlePicker";
import type { PortBinding } from "@/lib/types";

type Props = {
  value: Extract<PortBinding, { kind: "ref-select" }>;
  onChange: (next: Extract<PortBinding, { kind: "ref-select" }>) => void;
};

/**
 * Authoring control for the "ref-select" binding kind, using the user's
 * shuttle layout: actual rows from the reference table on the right
 * (Available), a curated subset on the left (Selected). Click rows to
 * highlight, arrows to move between columns. No JSON, no array typing.
 *
 * Data flow:
 *   1. Source — the user picks the reference table (cabin classes, airports, …)
 *   2. The shuttle's "label" comes from the table's first column; "hint" from
 *      the row's most-distinguishing other column.
 *   3. Selected items become whereValues — the engine treats them as
 *      "rows where {column} is one of these".
 *
 * For more advanced filtering (different column, different valueColumn) we
 * fall back to dropdowns shown in compact form below the shuttle. 90 % of
 * users will only need the shuttle.
 */
export function ReferenceMultiSelect({ value, onChange }: Props) {
  const refs = useReferencesStore((s) => s.references);
  const loaded = useReferencesStore((s) => s.loaded);
  const load = useReferencesStore((s) => s.load);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const ref = refs.find((r) => r.id === value.referenceId);

  // Auto-pick first column as the value column once a ref is chosen.
  useEffect(() => {
    if (ref && !value.valueColumn && ref.columns.length > 0) {
      onChange({ ...value, valueColumn: ref.columns[0] });
    }
  }, [ref, value, onChange]);

  // Build shuttle items from the table's rows. Use the row's first column
  // as the secondary "hint" so the user sees something like
  //   Business (J)        — label = "Business", hint = "J"
  // when a "name" column exists; otherwise fall through gracefully.
  const items = useMemo<ShuttleItem[]>(() => {
    if (!ref) return [];
    const labelCol = pickLabelColumn(ref.columns);
    const codeCol = value.valueColumn || ref.columns[0];
    return ref.rows.map((row) => {
      const code = String(row[codeCol] ?? "");
      const label = labelCol && row[labelCol] != null ? String(row[labelCol]) : code;
      return { value: code, label, hint: code !== label ? code : undefined };
    });
  }, [ref, value.valueColumn]);

  // Selected list = whereValues (these are the cell values from valueColumn
  // that pass the filter). This treats whereColumn === valueColumn — the
  // simple case the user described.
  const selected = useMemo(() => {
    // If the user has a separate whereColumn set, fall back to whereValues.
    // Otherwise treat the selection as direct value-column filtering.
    return value.whereValues ?? [];
  }, [value.whereValues]);

  function setSelection(next: string[]) {
    onChange({
      ...value,
      whereColumn: value.valueColumn,   // simple case: filter on the same column
      whereValues: next,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Step 1: pick the ref table */}
      <div className="grid grid-cols-[80px_1fr] gap-2 items-center">
        <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-medium">From</span>
        <Select
          value={value.referenceId}
          onChange={(e) =>
            onChange({
              referenceId: e.target.value,
              valueColumn: "",
              whereColumn: undefined,
              whereValues: undefined,
              kind: "ref-select",
            })
          }
        >
          <option value="">— choose a reference table —</option>
          {refs.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </Select>
      </div>

      {ref ? (
        <ShuttlePicker
          title={`Select ${stripPrefix(ref.name)}`}
          description={`${ref.rows.length} rows in ${ref.name}. Click items and use arrows to move between columns.`}
          items={items}
          selected={selected}
          onChange={setSelection}
        />
      ) : null}

      {ref ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2 flex items-center gap-2">
          <Database className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-medium">Resolves to</span>
          <span className="text-[10.5px] text-muted-foreground tabular-nums ml-auto">
            {selected.length} {selected.length === 1 ? "value" : "values"}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function pickLabelColumn(cols: string[]): string | undefined {
  // Prefer name-ish columns over code-ish ones for the label.
  const namesFirst = ["name", "label", "title", "description"];
  for (const n of namesFirst) {
    const hit = cols.find((c) => c.toLowerCase() === n);
    if (hit) return hit;
  }
  // Fall back to the second column (first column is usually the code/id).
  if (cols.length >= 2) return cols[1];
  return undefined;
}

function stripPrefix(name: string): string {
  // "ref-airports" / "Airports — code to name" → "airports" — used in the
  // shuttle title so the user reads "Select airports" not "Select Airports — code to name".
  return name.replace(/^ref[-: ]?/i, "").replace(/\s*[—–-].*$/, "").toLowerCase();
}
