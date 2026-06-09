"use client";

import type { PortBinding } from "@/lib/types";
import { RequestFieldSelect } from "./RequestFieldSelect";
import type { LoopVar } from "@/lib/rule/loop-vars";

// One number filter, many conditions on the SAME field — combined by ALL (AND)
// or ANY (OR). Replaces a chain of single-compare filter nodes, e.g.
// "EK flight number ≥ 100 AND ≤ 199 AND in {101,150,199}" in a single node.

export type NumCond = {
  operator: string;
  value?: number;
  values?: number[];
  min?: number;
  max?: number;
};

const NUM_OPS: { value: string; label: string; kind: "single" | "range" | "list" | "none" }[] = [
  { value: "equals", label: "= equals", kind: "single" },
  { value: "not_equals", label: "≠ not equal", kind: "single" },
  { value: "gte", label: "≥ at least", kind: "single" },
  { value: "lte", label: "≤ at most", kind: "single" },
  { value: "gt", label: "> greater than", kind: "single" },
  { value: "lt", label: "< less than", kind: "single" },
  { value: "between", label: "between (incl.)", kind: "range" },
  { value: "not_between", label: "not between", kind: "range" },
  { value: "in", label: "in list", kind: "list" },
  { value: "not_in", label: "not in list", kind: "list" },
  { value: "is_null", label: "is empty / missing", kind: "none" },
];
const kindOf = (op: string) => NUM_OPS.find((o) => o.value === op)?.kind ?? "single";

export function NumberConditionsEditor({
  source,
  onSource,
  conditions,
  match,
  onChange,
  legacy,
  loopVars,
  inputSchema,
}: {
  source: PortBinding | undefined;
  onSource: (b: PortBinding | null) => void;
  conditions: NumCond[];
  match: string;
  onChange: (conditions: NumCond[], match: string) => void;
  legacy?: NumCond | null;
  loopVars?: LoopVar[];
  inputSchema?: unknown;
}) {
  const sourcePath = source?.kind === "path" ? source.path : source?.kind === "context" ? `$ctx.${source.key}` : "";
  const isAny = match === "any";
  const display: NumCond[] = conditions.length ? conditions : [legacy?.operator ? legacy : { operator: "gte" }];

  function commit(next: NumCond[]) { onChange(next, match); }
  function setCond(i: number, patch: Partial<NumCond>) { commit(display.map((c, idx) => (idx === i ? { ...c, ...patch } : c))); }
  function addCond() { commit([...display, { operator: "gte" }]); }
  function removeCond(i: number) { onChange(display.filter((_, idx) => idx !== i), match); }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(190px, 220px) 1fr", gap: 16, alignItems: "start" }}>
        {/* LEFT — field only */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="field-label" style={{ margin: 0 }}>Filter by<span className="req-pill">req</span></span>
          <RequestFieldSelect value={sourcePath} onChange={(p) => onSource(p ? { kind: "path", path: p } : null)} schema={inputSchema} loopVars={loopVars} placeholder="$.flightNumber" />
        </div>

        {/* RIGHT — conditions + add */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <span className="field-label" style={{ margin: 0 }}>Conditions</span>
          {display.map((c, i) => {
            const k = kindOf(c.operator);
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "150px 1fr 28px", gap: 8, alignItems: "center" }}>
                <select className="input" value={c.operator}
                  onChange={(e) => setCond(i, { operator: e.target.value, value: undefined, values: undefined, min: undefined, max: undefined })}>
                  {NUM_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>

                {k === "single" && (
                  <input className="input mono" type="number" value={c.value ?? ""}
                    onChange={(e) => setCond(i, { value: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="value" />
                )}
                {k === "range" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input className="input mono" type="number" style={{ flex: 1, minWidth: 0 }} value={c.min ?? ""}
                      onChange={(e) => setCond(i, { min: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="min" />
                    <span style={{ color: "var(--text-muted, #71717a)", fontSize: 12 }}>to</span>
                    <input className="input mono" type="number" style={{ flex: 1, minWidth: 0 }} value={c.max ?? ""}
                      onChange={(e) => setCond(i, { max: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="max" />
                  </div>
                )}
                {k === "list" && (
                  <input className="input mono" value={(c.values ?? []).join(", ")}
                    onChange={(e) => setCond(i, { values: parseNumList(e.target.value) })} placeholder="101, 150, 199" />
                )}
                {k === "none" && <span style={{ color: "var(--text-muted, #71717a)", fontSize: 12 }}>—</span>}

                <button type="button" onClick={() => removeCond(i)} title="Remove condition" disabled={display.length === 1} style={removeBtnStyle(display.length === 1)}>×</button>
              </div>
            );
          })}
          <button type="button" onClick={addCond} style={addBtnStyle}>+ Add condition</button>
        </div>
      </div>

      {display.length > 1 && (
        <div style={dividerRowStyle}>
          <span className="field-label" style={{ margin: 0 }}>Combine</span>
          <div style={{ display: "inline-flex", borderRadius: 6, overflow: "hidden", border: "1px solid var(--border, #d4d4d8)" }}>
            <button type="button" onClick={() => onChange(display, "all")} style={segStyle(!isAny)}>ALL</button>
            <button type="button" onClick={() => onChange(display, "any")} style={segStyle(isAny)}>ANY</button>
          </div>
          <span style={{ fontSize: 11, color: "var(--text-muted, #71717a)" }}>{isAny ? "any condition passes (OR)" : "every condition must pass (AND)"}</span>
        </div>
      )}
    </div>
  );
}

const dividerRowStyle: React.CSSProperties = { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, paddingTop: 12, borderTop: "1px solid var(--border, #e4e4e7)" };
const addBtnStyle: React.CSSProperties = { alignSelf: "start", marginTop: 2, fontSize: 12, padding: "5px 10px", borderRadius: 6, border: "1px dashed var(--border-strong, #c4c4c8)", background: "transparent", color: "var(--text, #18181b)", cursor: "pointer" };
function removeBtnStyle(disabled: boolean): React.CSSProperties {
  return { width: 26, height: 26, borderRadius: 6, border: "1px solid var(--border, #d4d4d8)", background: "transparent", color: "var(--text-muted, #71717a)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1 };
}
function segStyle(active: boolean): React.CSSProperties {
  return { fontSize: 11, fontWeight: 600, padding: "4px 14px", border: 0, cursor: "pointer", background: active ? "var(--accent, #2563eb)" : "transparent", color: active ? "#fff" : "var(--text-muted, #71717a)" };
}
function parseNumList(s: string): number[] {
  return s.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean).map(Number).filter((n) => !Number.isNaN(n));
}
