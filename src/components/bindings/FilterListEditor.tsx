"use client";

import type { PortBinding } from "@/lib/types";
import { RequestFieldSelect } from "./RequestFieldSelect";
import { NumberConditionsEditor, type NumCond } from "./NumberConditionsEditor";
import { DateConditionsEditor, type DateCond } from "./DateConditionsEditor";
import { TextConditionsEditor, type StrCond } from "./TextConditionsEditor";

// Friendly editor for the Filter-list node: keep the elements of an array whose
// chosen field meets a stack of conditions. Reuses the same typed conditions
// editors as the gate filters — fed the ARRAY's item schema, so their field
// picker offers element fields (status, delayMinutes, …) and writes them as the
// element-relative `field`. Conditions live in extras (same shape the compiler
// already reads), so a Filter-list condition behaves exactly like a gate filter.
export function FilterListEditor({
  draft,
  setBinding,
  extras,
  setExtras,
  inputSchema,
}: {
  draft: Record<string, PortBinding>;
  setBinding: (port: string, b: PortBinding | null) => void;
  extras: Record<string, unknown>;
  setExtras: (updater: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
  inputSchema?: unknown;
}) {
  const sourcePath = draft.source?.kind === "path" ? draft.source.path : "";
  const field = draft.field?.kind === "literal" && typeof draft.field.value === "string" ? draft.field.value : "";
  const valueType =
    draft.valueType?.kind === "literal" && typeof draft.valueType.value === "string" ? draft.valueType.value : "string";

  const itemSchema = arrayItemSchema(inputSchema, sourcePath);
  // The conditions editors think in request paths; map their field ⇄ our literal `field`.
  const fieldSource: PortBinding | undefined = field
    ? { kind: "path", path: field.startsWith("$") ? field : `$.${field}` }
    : undefined;
  const onFieldSource = (b: PortBinding | null) =>
    setBinding("field", b?.kind === "path" ? { kind: "literal", value: b.path.replace(/^\$\.?/, "") } : null);

  const setType = (t: string) => {
    setBinding("valueType", { kind: "literal", value: t });
    setExtras((prev) => ({ ...prev, conditions: [] })); // avoid rendering mismatched-type conditions
  };

  const conditions = Array.isArray(extras.conditions) ? extras.conditions : [];
  const match = typeof extras.match === "string" ? extras.match : "all";

  return (
    <>
      <section className="field-group">
        <span className="field-label">Filter which list<span className="req-pill">req</span></span>
        <p className="field-hint">The array to filter down — e.g. $.flights. Leave blank to use the previous node&rsquo;s output.</p>
        <RequestFieldSelect
          value={sourcePath}
          onChange={(p) => setBinding("source", p ? { kind: "path", path: p } : null)}
          schema={inputSchema}
          placeholder="$.flights"
        />
      </section>

      <section className="field-group">
        <span className="field-label">Compare each item&rsquo;s field as</span>
        <div style={{ display: "inline-flex", borderRadius: 6, overflow: "hidden", border: "1px solid var(--border, #d4d4d8)" }}>
          {(["string", "number", "date"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setType(t)} style={seg(valueType === t)}>
              {t === "string" ? "Text" : t === "number" ? "Number" : "Date"}
            </button>
          ))}
        </div>
      </section>

      <section className="field-group">
        <span className="field-label">Keep items where&hellip;<span className="req-pill">req</span></span>
        <p className="field-hint">Pick a field on each item, then the conditions it must meet to stay in the list.</p>
        {valueType === "number" ? (
          <NumberConditionsEditor
            source={fieldSource}
            onSource={onFieldSource}
            conditions={conditions as NumCond[]}
            match={match}
            onChange={(c, m) => setExtras((prev) => ({ ...prev, conditions: c, match: m }))}
            legacy={null}
            inputSchema={itemSchema}
          />
        ) : valueType === "date" ? (
          <DateConditionsEditor
            source={fieldSource}
            onSource={onFieldSource}
            conditions={conditions as DateCond[]}
            match={match}
            timezone={typeof extras.timezone === "string" ? extras.timezone : ""}
            onChange={(c, m, tz) => setExtras((prev) => ({ ...prev, conditions: c, match: m, timezone: tz }))}
            inputSchema={itemSchema}
          />
        ) : (
          <TextConditionsEditor
            source={fieldSource}
            onSource={onFieldSource}
            conditions={conditions as StrCond[]}
            match={match}
            caseSensitive={!!extras.caseSensitive}
            onChange={(c, m, cs) => setExtras((prev) => ({ ...prev, conditions: c, match: m, caseSensitive: cs }))}
            inputSchema={itemSchema}
          />
        )}
      </section>
    </>
  );
}

function seg(active: boolean): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 600,
    padding: "4px 12px",
    border: 0,
    cursor: "pointer",
    background: active ? "var(--accent, #2563eb)" : "transparent",
    color: active ? "#fff" : "var(--text-muted, #71717a)",
  };
}

// Resolve an array path in the schema → its item schema ({type:object, properties}).
function arrayItemSchema(schema: unknown, arrayPath: string): unknown {
  if (!arrayPath) return undefined;
  type S = { type?: string; properties?: Record<string, S>; items?: S };
  const parts = arrayPath.replace(/^\$\.?/, "").split(".").filter(Boolean);
  let node = schema as S | undefined;
  for (const p of parts) {
    node = node?.properties?.[p];
    if (!node) return undefined;
  }
  return node?.type === "array" ? node.items : undefined;
}
