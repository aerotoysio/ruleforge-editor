"use client";

import type { PortBinding } from "@/lib/types";
import { RequestFieldSelect } from "./RequestFieldSelect";
import type { LoopVar } from "@/lib/rule/loop-vars";

// One date/time filter, many conditions on the SAME field — combined by ALL
// (AND) or ANY (OR). Conditions can mix granularities: "weekday AND after 06:00
// AND before a cutoff date" is a single node. Native date/time inputs give
// calendar/time popups with no extra deps; a shared timezone applies to all.

export type DateCond = {
  operator: string;
  granularity?: string; // datetime | date | time
  value?: string;
  from?: string;
  to?: string;
  amount?: number;
  unit?: string;
  values?: number[];
};

const DATE_OPS: { value: string; label: string; kind: string }[] = [
  { value: "after", label: "after", kind: "single" },
  { value: "before", label: "before", kind: "single" },
  { value: "equals", label: "on (equals)", kind: "single" },
  { value: "not_equals", label: "not on", kind: "single" },
  { value: "between", label: "between", kind: "range" },
  { value: "not_between", label: "not between", kind: "range" },
  { value: "within_last", label: "within the last", kind: "relative" },
  { value: "within_next", label: "within the next", kind: "relative" },
  { value: "day_of_week", label: "on a day of week", kind: "dow" },
  { value: "month_of_year", label: "in a month", kind: "moy" },
  { value: "is_weekend", label: "is weekend / weekday", kind: "weekend" },
  { value: "is_null", label: "is empty / missing", kind: "none" },
];
const kindOf = (op: string) => DATE_OPS.find((o) => o.value === op)?.kind ?? "single";

const DOW: [string, number][] = [["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6], ["Sun", 7]];
const MONTHS: [string, number][] = [["Jan", 1], ["Feb", 2], ["Mar", 3], ["Apr", 4], ["May", 5], ["Jun", 6], ["Jul", 7], ["Aug", 8], ["Sep", 9], ["Oct", 10], ["Nov", 11], ["Dec", 12]];
const UNITS = ["minutes", "hours", "days", "weeks", "months"];
const TIMEZONES = ["", "UTC", "Europe/London", "Europe/Paris", "Africa/Johannesburg", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo", "America/New_York", "America/Los_Angeles", "Australia/Sydney"];

function inputTypeFor(gran?: string): string {
  if (gran === "time") return "time";
  if (gran === "datetime") return "datetime-local";
  return "date";
}

export function DateConditionsEditor({
  source,
  onSource,
  conditions,
  match,
  timezone,
  onChange,
  loopVars,
  inputSchema,
}: {
  source: PortBinding | undefined;
  onSource: (b: PortBinding | null) => void;
  conditions: DateCond[];
  match: string;
  timezone: string;
  onChange: (conditions: DateCond[], match: string, timezone: string) => void;
  loopVars?: LoopVar[];
  inputSchema?: unknown;
}) {
  const sourcePath = source?.kind === "path" ? source.path : source?.kind === "context" ? `$ctx.${source.key}` : "";
  const isAny = match === "any";
  const display: DateCond[] = conditions.length ? conditions : [{ operator: "after", granularity: "date" }];

  function commit(next: DateCond[]) { onChange(next, match, timezone); }
  function setCond(i: number, patch: Partial<DateCond>) { commit(display.map((c, idx) => (idx === i ? { ...c, ...patch } : c))); }
  function addCond() { commit([...display, { operator: "after", granularity: "date" }]); }
  function removeCond(i: number) { onChange(display.filter((_, idx) => idx !== i), match, timezone); }
  function toggleVal(i: number, n: number) {
    const cur = display[i].values ?? [];
    const next = cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n].sort((a, b) => a - b);
    setCond(i, { values: next });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(190px, 220px) 1fr", gap: 16, alignItems: "start" }}>
        {/* LEFT — field only */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="field-label" style={{ margin: 0 }}>Filter by<span className="req-pill">req</span></span>
          <RequestFieldSelect value={sourcePath} onChange={(p) => onSource(p ? { kind: "path", path: p } : null)} schema={inputSchema} loopVars={loopVars} placeholder="$.departureTime" />
        </div>

        {/* RIGHT — conditions + add */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
          <span className="field-label" style={{ margin: 0 }}>Conditions</span>
          {display.map((c, i) => {
            const k = kindOf(c.operator);
            const t = inputTypeFor(c.granularity);
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 28px", gap: 8, alignItems: "start", padding: 8, borderRadius: 8, background: "var(--surface-2, rgba(127,127,127,0.05))", border: "1px solid var(--border, #e4e4e7)" }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                  <select className="input" style={{ width: "auto", minWidth: 150 }} value={c.operator}
                    onChange={(e) => setCond(i, { operator: e.target.value, value: undefined, from: undefined, to: undefined, amount: undefined, unit: undefined, values: undefined })}>
                    {DATE_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>

                  {(k === "single" || k === "range") && (
                    <select className="input" style={{ width: "auto" }} value={c.granularity ?? "date"} onChange={(e) => setCond(i, { granularity: e.target.value })} title="Compare the date part, time part, or full instant">
                      <option value="date">date</option>
                      <option value="datetime">date + time</option>
                      <option value="time">time of day</option>
                    </select>
                  )}
                  {k === "single" && (
                    <input className="input" style={{ width: "auto" }} type={t} value={c.value ?? ""} onChange={(e) => setCond(i, { value: e.target.value || undefined })} />
                  )}
                  {k === "range" && (
                    <>
                      <input className="input" style={{ width: "auto" }} type={t} value={c.from ?? ""} onChange={(e) => setCond(i, { from: e.target.value || undefined })} />
                      <span style={{ color: "var(--text-muted, #71717a)", fontSize: 12 }}>to</span>
                      <input className="input" style={{ width: "auto" }} type={t} value={c.to ?? ""} onChange={(e) => setCond(i, { to: e.target.value || undefined })} />
                    </>
                  )}
                  {k === "relative" && (
                    <>
                      <input className="input" style={{ width: 80 }} type="number" min={1} value={c.amount ?? ""} onChange={(e) => setCond(i, { amount: e.target.value === "" ? undefined : Number(e.target.value) })} placeholder="N" />
                      <select className="input" style={{ width: "auto" }} value={c.unit ?? "days"} onChange={(e) => setCond(i, { unit: e.target.value })}>
                        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </>
                  )}
                  {k === "dow" && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {DOW.map(([lbl, n]) => <Chip key={n} label={lbl} active={(c.values ?? []).includes(n)} onClick={() => toggleVal(i, n)} />)}
                    </div>
                  )}
                  {k === "moy" && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {MONTHS.map(([lbl, n]) => <Chip key={n} label={lbl} active={(c.values ?? []).includes(n)} onClick={() => toggleVal(i, n)} />)}
                    </div>
                  )}
                  {k === "weekend" && (
                    <div style={{ display: "inline-flex", borderRadius: 6, overflow: "hidden", border: "1px solid var(--border, #d4d4d8)" }}>
                      <button type="button" onClick={() => setCond(i, { value: "true" })} style={segStyle(c.value !== "false")}>weekend</button>
                      <button type="button" onClick={() => setCond(i, { value: "false" })} style={segStyle(c.value === "false")}>weekday</button>
                    </div>
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
              <button type="button" onClick={() => onChange(display, "all", timezone)} style={segStyle(!isAny)}>ALL</button>
              <button type="button" onClick={() => onChange(display, "any", timezone)} style={segStyle(isAny)}>ANY</button>
            </div>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="field-label" style={{ margin: 0, color: "var(--text-muted, #71717a)" }}>Timezone</span>
          <select className="input" style={{ width: "auto" }} value={timezone} onChange={(e) => onChange(display, match, e.target.value)}>
            {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz === "" ? "(server default · UTC)" : tz}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 6, cursor: "pointer", border: "1px solid " + (active ? "var(--accent, #2563eb)" : "var(--border, #d4d4d8)"), background: active ? "var(--accent, #2563eb)" : "transparent", color: active ? "#fff" : "var(--text-muted, #71717a)" }}>
      {label}
    </button>
  );
}

const dividerRowStyle: React.CSSProperties = { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 16, paddingTop: 12, borderTop: "1px solid var(--border, #e4e4e7)" };
const addBtnStyle: React.CSSProperties = { alignSelf: "start", marginTop: 2, fontSize: 12, padding: "5px 10px", borderRadius: 6, border: "1px dashed var(--border-strong, #c4c4c8)", background: "transparent", color: "var(--text, #18181b)", cursor: "pointer" };
function removeBtnStyle(disabled: boolean): React.CSSProperties {
  return { width: 26, height: 26, borderRadius: 6, border: "1px solid var(--border, #d4d4d8)", background: "transparent", color: "var(--text-muted, #71717a)", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1 };
}
function segStyle(active: boolean): React.CSSProperties {
  return { fontSize: 11, fontWeight: 600, padding: "4px 12px", border: 0, cursor: "pointer", background: active ? "var(--accent, #2563eb)" : "transparent", color: active ? "#fff" : "var(--text-muted, #71717a)" };
}
