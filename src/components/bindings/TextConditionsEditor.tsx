"use client";

import { useEffect } from "react";
import type { PortBinding } from "@/lib/types";
import { useReferencesStore } from "@/lib/store/references-store";
import { RequestFieldSelect } from "./RequestFieldSelect";
import type { LoopVar } from "@/lib/rule/loop-vars";

// One text filter, many conditions on the SAME field — combined by ALL (AND) or
// ANY (OR). The unified filter that replaces the cabin / pax-type / loyalty
// veneers: each condition's value is typed text, a typed list, or a COLUMN FROM
// A REFERENCE TABLE. "in" a reference column = pass when the request value is a
// valid item; "not in" = pass when it isn't.

export type StrCond = {
  operator: string;
  value?: string;
  values?: string[];
  mode?: "list" | "ref";
  refId?: string;
  refColumn?: string;
};

const STR_OPS: { value: string; label: string; kind: string }[] = [
  { value: "equals", label: "= equals", kind: "single" },
  { value: "not_equals", label: "≠ not equal", kind: "single" },
  { value: "contains", label: "contains", kind: "single" },
  { value: "not_contains", label: "doesn't contain", kind: "single" },
  { value: "starts_with", label: "starts with", kind: "single" },
  { value: "ends_with", label: "ends with", kind: "single" },
  { value: "in", label: "in list / reference", kind: "list" },
  { value: "not_in", label: "not in list / reference", kind: "list" },
  { value: "regex", label: "matches regex", kind: "single" },
  { value: "is_null", label: "is missing", kind: "none" },
  { value: "is_empty", label: "is empty", kind: "none" },
];
const kindOf = (op: string) => STR_OPS.find((o) => o.value === op)?.kind ?? "single";

export function TextConditionsEditor({
  source,
  onSource,
  conditions,
  match,
  caseSensitive,
  onChange,
  loopVars,
  inputSchema,
}: {
  source: PortBinding | undefined;
  onSource: (b: PortBinding | null) => void;
  conditions: StrCond[];
  match: string;
  caseSensitive: boolean;
  onChange: (conditions: StrCond[], match: string, caseSensitive: boolean) => void;
  loopVars?: LoopVar[];
  inputSchema?: unknown;
}) {
  const references = useReferencesStore((s) => s.references);
  const refsLoaded = useReferencesStore((s) => s.loaded);
  const loadRefs = useReferencesStore((s) => s.load);
  useEffect(() => { if (!refsLoaded) void loadRefs(); }, [refsLoaded, loadRefs]);

  const sourcePath = source?.kind === "path" ? source.path : source?.kind === "context" ? `$ctx.${source.key}` : "";
  const isAny = match === "any";
  const display: StrCond[] = conditions.length ? conditions : [{ operator: "equals" }];

  function commit(next: StrCond[]) { onChange(next, match, caseSensitive); }
  function setCond(i: number, patch: Partial<StrCond>) { commit(display.map((c, idx) => (idx === i ? { ...c, ...patch } : c))); }
  function addCond() { commit([...display, { operator: "equals" }]); }
  function removeCond(i: number) { onChange(display.filter((_, idx) => idx !== i), match, caseSensitive); }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(190px, 220px) 1fr", gap: 16, alignItems: "start" }}>
        {/* LEFT — field only */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="field-label" style={{ margin: 0 }}>Filter by<span className="req-pill">req</span></span>
          <RequestFieldSelect value={sourcePath} onChange={(p) => onSource(p ? { kind: "path", path: p } : null)} schema={inputSchema} loopVars={loopVars} placeholder="$.cabin" />
        </div>

        {/* RIGHT — conditions + add */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <span className="field-label" style={{ margin: 0 }}>Conditions</span>
          {display.map((c, i) => {
            const k = kindOf(c.operator);
            const cols = references.find((r) => r.id === c.refId)?.columns ?? [];
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 28px", gap: 8, alignItems: "start", padding: 8, borderRadius: 8, background: "var(--surface-2, rgba(127,127,127,0.05))", border: "1px solid var(--border, #e4e4e7)" }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                  <select className="input" style={{ width: "auto", minWidth: 165 }} value={c.operator}
                    onChange={(e) => setCond(i, { operator: e.target.value, value: undefined, values: undefined, mode: undefined, refId: undefined, refColumn: undefined })}>
                    {STR_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>

                  {k === "single" && (
                    <input className="input" style={{ width: "auto", minWidth: 160 }} value={c.value ?? ""}
                      onChange={(e) => setCond(i, { value: e.target.value })} placeholder={c.operator === "regex" ? "^EK\\d+$" : "value"} />
                  )}

                  {k === "list" && (
                    <>
                      <div style={{ display: "inline-flex", borderRadius: 6, overflow: "hidden", border: "1px solid var(--border, #d4d4d8)" }}>
                        <button type="button" onClick={() => setCond(i, { mode: "list" })} style={segStyle((c.mode ?? "list") === "list")}>type list</button>
                        <button type="button" onClick={() => setCond(i, { mode: "ref" })} style={segStyle(c.mode === "ref")}>from reference</button>
                      </div>
                      {c.mode === "ref" ? (
                        <>
                          <select className="input" style={{ width: "auto" }} value={c.refId ?? ""}
                            onChange={(e) => { const t = references.find((r) => r.id === e.target.value); setCond(i, { refId: e.target.value || undefined, refColumn: t?.columns[0] }); }}>
                            <option value="">— table —</option>
                            {references.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                          <select className="input" style={{ width: "auto" }} value={c.refColumn ?? ""} disabled={!c.refId} onChange={(e) => setCond(i, { refColumn: e.target.value })}>
                            {cols.map((col) => <option key={col} value={col}>{col}</option>)}
                          </select>
                        </>
                      ) : (
                        <input className="input" style={{ width: "auto", minWidth: 160 }} value={(c.values ?? []).join(", ")}
                          onChange={(e) => setCond(i, { values: e.target.value.split(/[,\n]/).map((s) => s.trim()).filter(Boolean) })} placeholder="J, F, A" />
                      )}
                    </>
                  )}

                  {k === "none" && <span style={{ color: "var(--text-muted, #71717a)", fontSize: 12 }}>—</span>}
                </div>

                <button type="button" onClick={() => removeCond(i)} title="Remove condition" disabled={display.length === 1} style={removeBtnStyle(display.length === 1)}>×</button>
              </div>
            );
          })}
          <button type="button" onClick={addCond} style={addBtnStyle}>+ Add condition</button>
        </div>
      </div>

      {/* Settings — below a divider */}
      <div style={dividerRowStyle}>
        {display.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="field-label" style={{ margin: 0 }}>Combine</span>
            <div style={{ display: "inline-flex", borderRadius: 6, overflow: "hidden", border: "1px solid var(--border, #d4d4d8)" }}>
              <button type="button" onClick={() => onChange(display, "all", caseSensitive)} style={segStyle(!isAny)}>ALL</button>
              <button type="button" onClick={() => onChange(display, "any", caseSensitive)} style={segStyle(isAny)}>ANY</button>
            </div>
          </div>
        )}
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted, #71717a)", cursor: "pointer" }}>
          <input type="checkbox" checked={caseSensitive} onChange={(e) => onChange(display, match, e.target.checked)} />
          Case sensitive
        </label>
      </div>
    </div>
  );
}

const dividerRowStyle: React.CSSProperties = { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 16, paddingTop: 12, borderTop: "1px solid var(--border, #e4e4e7)" };
const addBtnStyle: React.CSSProperties = { alignSelf: "start", marginTop: 2, fontSize: 12, padding: "5px 10px", borderRadius: 6, border: "1px dashed var(--border-strong, #c4c4c8)", background: "transparent", color: "var(--text, #18181b)", cursor: "pointer" };
function removeBtnStyle(disabled: boolean): React.CSSProperties {
  return { width: 26, height: 26, borderRadius: 6, border: "1px solid var(--border, #d4d4d8)", background: "transparent", color: "var(--text-muted, #71717a)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1 };
}
function segStyle(active: boolean): React.CSSProperties {
  return { fontSize: 11, fontWeight: 600, padding: "4px 11px", border: 0, cursor: "pointer", background: active ? "var(--accent, #2563eb)" : "transparent", color: active ? "#fff" : "var(--text-muted, #71717a)" };
}
