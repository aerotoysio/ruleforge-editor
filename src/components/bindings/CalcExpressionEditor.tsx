"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Calc expression builder. The engine evaluates the expression with NCalc plus
 * a set of custom helpers (see RuleForge.Core/Evaluators/CalcEvaluator.cs).
 * This editor keeps the raw expression as the source of truth, but layers
 * click-to-insert palettes (variables / functions / operators) on top so an
 * author doesn't have to memorise the function names or NCalc syntax.
 */

export type CalcVar = { name: string; source: "request" | "field" | "loop" };

type Fn = { label: string; insert: string; caretBack: number; sig: string; desc: string };

const FN_GROUPS: { group: string; fns: Fn[] }[] = [
  {
    group: "Logic",
    fns: [
      { label: "if", insert: "if(, , )", caretBack: 4, sig: "if(condition, then, else)", desc: "Return one of two values based on a condition." },
    ],
  },
  {
    group: "Math",
    fns: [
      { label: "Round", insert: "Round(, 2)", caretBack: 4, sig: "Round(x, places)", desc: "Round to N decimal places." },
      { label: "Abs", insert: "Abs()", caretBack: 1, sig: "Abs(x)", desc: "Absolute value." },
      { label: "Floor", insert: "Floor()", caretBack: 1, sig: "Floor(x)", desc: "Round down to a whole number." },
      { label: "Ceiling", insert: "Ceiling()", caretBack: 1, sig: "Ceiling(x)", desc: "Round up to a whole number." },
      { label: "Min", insert: "Min(, )", caretBack: 3, sig: "Min(a, b)", desc: "Smaller of two numbers." },
      { label: "Max", insert: "Max(, )", caretBack: 3, sig: "Max(a, b)", desc: "Larger of two numbers." },
      { label: "Sqrt", insert: "Sqrt()", caretBack: 1, sig: "Sqrt(x)", desc: "Square root." },
      { label: "Pow", insert: "Pow(, )", caretBack: 3, sig: "Pow(x, y)", desc: "x raised to the power y." },
    ],
  },
  {
    group: "Dates",
    fns: [
      { label: "now", insert: "now()", caretBack: 0, sig: "now()", desc: "Current UTC date+time." },
      { label: "today", insert: "today()", caretBack: 0, sig: "today()", desc: "Current UTC date (midnight)." },
      { label: "yearsBetween", insert: "yearsBetween(, )", caretBack: 3, sig: "yearsBetween(a, b)", desc: "Whole years between two dates (e.g. age)." },
      { label: "monthsBetween", insert: "monthsBetween(, )", caretBack: 3, sig: "monthsBetween(a, b)", desc: "Whole months between two dates." },
      { label: "daysBetween", insert: "daysBetween(, )", caretBack: 3, sig: "daysBetween(a, b)", desc: "Whole days between two dates." },
      { label: "dayOfWeek", insert: "dayOfWeek()", caretBack: 1, sig: "dayOfWeek(d)", desc: "ISO weekday: Mon=1 … Sun=7." },
      { label: "isWeekend", insert: "isWeekend()", caretBack: 1, sig: "isWeekend(d)", desc: "True if Saturday or Sunday." },
      { label: "addDays", insert: "addDays(, )", caretBack: 3, sig: "addDays(d, n)", desc: "Add n days to a date." },
      { label: "formatDate", insert: "formatDate(, 'yyyy-MM-dd')", caretBack: 16, sig: "formatDate(d, fmt)", desc: "Format a date with a .NET format string." },
      { label: "parseDate", insert: "parseDate()", caretBack: 1, sig: "parseDate(text)", desc: "Parse an ISO date string into a date." },
    ],
  },
  {
    group: "Lists & text",
    fns: [
      { label: "count", insert: "count()", caretBack: 1, sig: "count(x)", desc: "Length of an array / string / object." },
      { label: "contains", insert: "contains(, )", caretBack: 3, sig: "contains(list, value)", desc: "True if the array contains the value (or substring)." },
    ],
  },
];

const OPERATORS: { label: string; insert: string }[] = [
  { label: "+", insert: " + " },
  { label: "−", insert: " - " },
  { label: "×", insert: " * " },
  { label: "÷", insert: " / " },
  { label: "%", insert: " % " },
  { label: "( )", insert: "()" },
  { label: "=", insert: " == " },
  { label: "≠", insert: " != " },
  { label: "<", insert: " < " },
  { label: "≤", insert: " <= " },
  { label: ">", insert: " > " },
  { label: "≥", insert: " >= " },
  { label: "and", insert: " and " },
  { label: "or", insert: " or " },
  { label: "not", insert: " not " },
];

const SOURCE_LABEL: Record<CalcVar["source"], string> = {
  field: "Record fields (computed upstream)",
  request: "Request fields",
  loop: "Loop variables",
};

export function CalcExpressionEditor({
  value,
  onChange,
  variables,
}: {
  value: string;
  onChange: (next: string) => void;
  variables: CalcVar[];
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [showRef, setShowRef] = useState(false);

  function insert(snippet: string, caretBack = 0) {
    const ta = taRef.current;
    const start = ta?.selectionStart ?? value.length;
    const end = ta?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + snippet + value.slice(end);
    onChange(next);
    const pos = start + snippet.length - caretBack;
    requestAnimationFrame(() => {
      if (ta) {
        ta.focus();
        ta.setSelectionRange(pos, pos);
      }
    });
  }

  const opens = (value.match(/\(/g) || []).length;
  const closes = (value.match(/\)/g) || []).length;
  const balanced = opens === closes;
  const empty = value.trim() === "";

  const grouped: Record<CalcVar["source"], CalcVar[]> = { field: [], request: [], loop: [] };
  for (const v of variables) grouped[v.source].push(v);

  return (
    <div className="flex flex-col gap-2">
      <textarea
        ref={taRef}
        className="json-input"
        style={{ fontFamily: "var(--font-mono)", minHeight: 84 }}
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g.  Round(baseDailyRate * durationDays * travellers, 2)"
        spellCheck={false}
      />

      <div style={{ fontSize: 11, display: "flex", gap: 10, alignItems: "center" }}>
        {empty ? (
          <span style={{ color: "var(--text-soft, #94a3b8)" }}>Build an expression — click a variable, function or operator to insert it.</span>
        ) : balanced ? (
          <span style={{ color: "var(--ok, #16a34a)" }}>✓ parentheses balanced</span>
        ) : (
          <span style={{ color: "var(--warn, #d97706)" }}>⚠ unbalanced parentheses ({opens} open / {closes} close)</span>
        )}
      </div>

      {/* Variables */}
      {(["field", "request", "loop"] as const).map((src) =>
        grouped[src].length > 0 ? (
          <div key={src} className="flex flex-col gap-1">
            <span className="field-label" style={{ fontSize: 10.5 }}>{SOURCE_LABEL[src]}</span>
            <div className="best-match-strip" style={{ flexWrap: "wrap" }}>
              {grouped[src].map((v) => (
                <button key={v.name} type="button" className="best-match-chip" title={`Insert ${v.name}`} onClick={() => insert(v.name)}>
                  {v.name}
                </button>
              ))}
            </div>
          </div>
        ) : null,
      )}

      {/* Operators */}
      <div className="flex flex-col gap-1">
        <span className="field-label" style={{ fontSize: 10.5 }}>Operators</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {OPERATORS.map((op) => (
            <button
              key={op.label}
              type="button"
              className="btn ghost sm"
              style={{ fontFamily: "var(--font-mono)", minWidth: 30, padding: "3px 8px" }}
              onClick={() => insert(op.insert, op.label === "( )" ? 1 : 0)}
            >
              {op.label}
            </button>
          ))}
        </div>
      </div>

      {/* Functions */}
      <div className="flex flex-col gap-1">
        <span className="field-label" style={{ fontSize: 10.5 }}>Functions</span>
        {FN_GROUPS.map((g) => (
          <div key={g.group} style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
            <span style={{ fontSize: 10.5, color: "var(--text-soft, #94a3b8)", width: 78 }}>{g.group}</span>
            {g.fns.map((fn) => (
              <button
                key={fn.label}
                type="button"
                className="btn ghost sm"
                style={{ fontFamily: "var(--font-mono)", padding: "3px 8px" }}
                title={`${fn.sig} — ${fn.desc}`}
                onClick={() => insert(fn.insert, fn.caretBack)}
              >
                {fn.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      <details className="raw" open={showRef} onToggle={(e) => setShowRef((e.target as HTMLDetailsElement).open)}>
        <summary>Function reference</summary>
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {FN_GROUPS.flatMap((g) => g.fns).map((fn) => (
            <div key={fn.label} style={{ display: "grid", gridTemplateColumns: "190px 1fr", gap: 8, fontSize: 11.5 }}>
              <code style={{ fontFamily: "var(--font-mono)" }}>{fn.sig}</code>
              <span style={{ color: "var(--text-soft, #64748b)" }}>{fn.desc}</span>
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "190px 1fr", gap: 8, fontSize: 11.5 }}>
            <code style={{ fontFamily: "var(--font-mono)" }}>{"'a' + b"}</code>
            <span style={{ color: "var(--text-soft, #64748b)" }}>String concatenation uses <code>+</code>.</span>
          </div>
        </div>
      </details>
    </div>
  );
}
