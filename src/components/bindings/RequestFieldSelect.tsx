"use client";

import { useMemo, useState } from "react";
import type { LoopVar } from "@/lib/rule/loop-vars";

// A clear request-field picker: a dropdown of the rule's request fields (leaf
// paths from the input schema) plus any in-scope loop variables ($item, $pax…),
// with an escape hatch to type a custom / nested path. Replaces the easy-to-miss
// `<input list>` datalist in the filter / parse editors.
export function RequestFieldSelect({
  value,
  onChange,
  schema,
  loopVars = [],
  placeholder,
}: {
  value: string;
  onChange: (path: string) => void;
  schema?: unknown;
  loopVars?: LoopVar[];
  placeholder?: string;
}) {
  const fields = useMemo(() => leafFields(schema), [schema]);
  const knownPaths = [...loopVars.map((l) => l.path), ...fields.map((f) => f.path)];
  const known = !value || knownPaths.includes(value);
  const [custom, setCustom] = useState(!!value && !known);

  if (custom || (fields.length === 0 && loopVars.length === 0)) {
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <input
          className="input mono"
          style={{ fontFamily: "var(--font-mono)", flex: 1, minWidth: 150 }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "$.field.path"}
        />
        {(fields.length > 0 || loopVars.length > 0) && (
          <button
            type="button"
            onClick={() => setCustom(false)}
            style={{ fontSize: 11, color: "var(--accent, #2563eb)", background: "none", border: 0, cursor: "pointer", padding: 0 }}
          >
            pick from list
          </button>
        )}
      </div>
    );
  }

  return (
    <select
      className="input"
      value={value}
      onChange={(e) => { if (e.target.value === "__custom__") setCustom(true); else onChange(e.target.value); }}
    >
      <option value="">— choose a field —</option>
      {loopVars.length > 0 && (
        <optgroup label="In the loop">
          {loopVars.map((l) => <option key={l.path} value={l.path}>{l.path}  ({l.type})</option>)}
        </optgroup>
      )}
      {fields.length > 0 && (
        <optgroup label="Request fields">
          {fields.map((f) => <option key={f.path} value={f.path}>{f.path}  ({f.type})</option>)}
        </optgroup>
      )}
      <option value="__custom__">✎ other / nested path…</option>
    </select>
  );
}

type Leaf = { path: string; type: string };
function leafFields(schema: unknown, prefix = "$"): Leaf[] {
  const props = (schema as { properties?: Record<string, { type?: string; properties?: unknown }> } | undefined)?.properties;
  if (!props || typeof props !== "object") return [];
  const out: Leaf[] = [];
  for (const [k, v] of Object.entries(props)) {
    const path = `${prefix}.${k}`;
    if (v?.type === "object" && v.properties) out.push(...leafFields(v, path));
    else out.push({ path, type: v?.type ?? "any" });
  }
  return out;
}
