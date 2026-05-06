"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/Input";

type Props = {
  columns: string[];
  rows: Record<string, unknown>[];
  onColumnsChange: (next: string[]) => void;
  onRowsChange: (next: Record<string, unknown>[]) => void;
};

export function ReferenceTableEditor({ columns, rows, onColumnsChange, onRowsChange }: Props) {
  const [newCol, setNewCol] = useState("");

  function addColumn() {
    const name = newCol.trim();
    if (!name || columns.includes(name)) return;
    onColumnsChange([...columns, name]);
    setNewCol("");
  }
  function removeColumn(idx: number) {
    const col = columns[idx];
    onColumnsChange(columns.filter((_, i) => i !== idx));
    onRowsChange(rows.map((r) => {
      const { [col]: _gone, ...rest } = r;
      void _gone;
      return rest;
    }));
  }
  function renameColumn(idx: number, next: string) {
    const oldName = columns[idx];
    if (!next.trim() || next === oldName || columns.includes(next)) return;
    const newColumns = [...columns];
    newColumns[idx] = next;
    onColumnsChange(newColumns);
    onRowsChange(rows.map((r) => {
      const { [oldName]: oldVal, ...rest } = r;
      return { ...rest, [next]: oldVal };
    }));
  }
  function setCell(rowIdx: number, col: string, raw: string) {
    const next = [...rows];
    let parsed: unknown = raw;
    if (raw === "") parsed = "";
    else if (raw === "true") parsed = true;
    else if (raw === "false") parsed = false;
    else if (raw === "null") parsed = null;
    else if (!Number.isNaN(Number(raw)) && raw.trim() !== "") parsed = Number(raw);
    next[rowIdx] = { ...next[rowIdx], [col]: parsed };
    onRowsChange(next);
  }
  function addRow() {
    const blank: Record<string, unknown> = {};
    for (const c of columns) blank[c] = "";
    onRowsChange([...rows, blank]);
  }
  function removeRow(idx: number) {
    onRowsChange(rows.filter((_, i) => i !== idx));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--color-fg-dim)" }}>Columns</div>
        <div className="flex flex-wrap gap-1.5 items-center">
          {columns.map((c, i) => (
            <div key={i} className="inline-flex items-center gap-1 px-1.5 py-1 rounded mono text-[12px]" style={{ background: "var(--color-bg-soft)", border: "1px solid var(--color-border)" }}>
              <input
                value={c}
                onChange={(e) => renameColumn(i, e.target.value)}
                className="bg-transparent w-24 outline-none"
              />
              <button
                onClick={() => removeColumn(i)}
                className="w-4 h-4 inline-flex items-center justify-center"
                style={{ color: "var(--color-fg-muted)" }}
                title="Remove column"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
          <div className="inline-flex items-center gap-1">
            <Input
              value={newCol}
              onChange={(e) => setNewCol(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addColumn(); }}
              placeholder="add column…"
              className="mono"
              style={{ width: 140 }}
            />
            <Button size="sm" onClick={addColumn} disabled={!newCol.trim()}>
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--color-fg-dim)" }}>
            Rows ({rows.length})
          </div>
          <Button size="sm" onClick={addRow} disabled={columns.length === 0}>
            <Plus className="w-3.5 h-3.5" /> Add row
          </Button>
        </div>
        {columns.length === 0 ? (
          <p className="text-[12px]" style={{ color: "var(--color-fg-muted)" }}>Add columns first.</p>
        ) : (
          <div className="overflow-auto rounded" style={{ border: "1px solid var(--color-border)" }}>
            <table className="w-full mono text-[12px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c} className="text-left px-2 py-1.5" style={{ background: "var(--color-bg-soft)", borderBottom: "1px solid var(--color-border)", color: "var(--color-fg-muted)", fontWeight: 500 }}>
                      {c}
                    </th>
                  ))}
                  <th style={{ background: "var(--color-bg-soft)", borderBottom: "1px solid var(--color-border)", width: 32 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri}>
                    {columns.map((c) => (
                      <td key={c} className="px-1 py-0.5" style={{ borderBottom: "1px solid var(--color-border)" }}>
                        <input
                          value={String(row[c] ?? "")}
                          onChange={(e) => setCell(ri, c, e.target.value)}
                          className="w-full px-1 py-1 outline-none"
                          style={{ background: "transparent" }}
                        />
                      </td>
                    ))}
                    <td className="px-1" style={{ borderBottom: "1px solid var(--color-border)" }}>
                      <button
                        onClick={() => removeRow(ri)}
                        className="w-6 h-6 inline-flex items-center justify-center"
                        style={{ color: "var(--color-fg-muted)" }}
                        title="Remove row"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 1} className="px-2 py-3 text-center" style={{ color: "var(--color-fg-dim)" }}>
                      No rows. Click <span className="font-medium">Add row</span>.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px]" style={{ color: "var(--color-fg-dim)" }}>
          Cell values are auto-parsed: numbers, <span className="mono">true</span>/<span className="mono">false</span>/<span className="mono">null</span>, otherwise strings.
        </p>
      </div>
    </div>
  );
}
