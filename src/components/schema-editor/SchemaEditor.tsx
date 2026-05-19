"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileJson, Wand2 } from "lucide-react";
import type { JsonSchema, JsonSchemaType } from "@/lib/types";
import { inferSchema } from "@/lib/schema/infer";
import { samplePayload } from "@/lib/schema/sample-payload";
import { mergeInferredIntoSchema } from "@/lib/schema/merge";
import { validateSchemaShape } from "@/lib/schema/validate";
import { FieldRow, AddField } from "./FieldRow";

type Props = {
  schema: JsonSchema;
  onChange: (next: JsonSchema) => void;
};

const TOP_TYPES: JsonSchemaType[] = ["object", "array", "string", "number", "integer", "boolean"];

/**
 * Two-pane schema editor.
 *
 * Left  = structured field-by-field editor (visual). Source of truth for
 *         field-level metadata: description, format, enum, min/max, required.
 * Right = live sample JSON. Always a view of the current schema, but the
 *         user can also edit it directly — after a brief debounce we infer
 *         a schema from the edited sample and merge it back into the
 *         existing schema (preserving metadata where types still match).
 *
 * Why one screen instead of three tabs? Tabs make the relationship between
 * structure and sample feel modal — the user has to remember which view
 * is canonical. With both visible at once, every visual edit shows up in
 * the sample instantly, and every paste into the sample re-derives the
 * structure. The schema and the sample are two views of the same thing.
 */
export function SchemaEditor({ schema, onChange }: Props) {
  const type = pickType(schema) ?? "object";

  // ── Sample pane state ─────────────────────────────────────────────────
  // The sample is derived from the schema by default. When the user starts
  // typing into it, we stop overwriting it (`userEditedSample`) until they
  // pause for SYNC_DEBOUNCE_MS — at which point we infer and merge back.
  const SYNC_DEBOUNCE_MS = 600;
  const derivedSample = useMemo(() => samplePayload(schema), [schema]);
  const [sampleText, setSampleText] = useState<string>(() => prettyJson(derivedSample));
  const [sampleError, setSampleError] = useState<string | null>(null);
  const userEditedRef = useRef(false);
  const lastSyncedSchemaRef = useRef<string>(JSON.stringify(schema));

  // When the schema changes externally (e.g. via the field-row editor on the
  // left), regenerate the sample preview. Two ways to skip the overwrite:
  //   1. User is mid-edit on the sample pane — their text wins until flush.
  //   2. The incoming schema IS the one we just synced from sample → would
  //      otherwise pretty-print over their work and jump the cursor.
  useEffect(() => {
    const schemaJson = JSON.stringify(schema);
    if (schemaJson === lastSyncedSchemaRef.current) {
      // Self-update echo — don't reformat the user's sample.
      return;
    }
    if (userEditedRef.current) return;
    setSampleText(prettyJson(samplePayload(schema)));
    setSampleError(null);
    lastSyncedSchemaRef.current = schemaJson;
  }, [schema]);

  // Debounced sample → schema inference.
  useEffect(() => {
    if (!userEditedRef.current) return;
    const handle = window.setTimeout(() => {
      try {
        const parsed = JSON.parse(sampleText);
        const inferred = inferSchema(parsed);
        const merged = mergeInferredIntoSchema(schema, inferred);
        const mergedJson = JSON.stringify(merged);
        if (mergedJson !== lastSyncedSchemaRef.current) {
          lastSyncedSchemaRef.current = mergedJson;
          onChange(merged);
        }
        setSampleError(null);
      } catch (err) {
        // Don't propagate to schema while sample is mid-edit and invalid.
        setSampleError((err as Error).message);
      } finally {
        userEditedRef.current = false;
      }
    }, SYNC_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
    // We intentionally exclude `schema` and `onChange` — including them would
    // cause the debounce to retrigger every keystroke via the schema-update
    // round trip. The flush effect fires when sampleText changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleText]);

  function onSampleEdit(next: string) {
    userEditedRef.current = true;
    setSampleText(next);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header: top-level type picker (only meaningful at root). */}
      <div className="flex items-center gap-3 text-[12.5px]">
        <span style={{ color: "var(--text-muted)" }}>Top-level type</span>
        <select
          className="input"
          style={{ width: 160 }}
          value={type}
          onChange={(e) => onChange(retypeRoot(schema, e.target.value as JsonSchemaType))}
        >
          {TOP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <div
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            color: "var(--text-muted)",
          }}
        >
          <Wand2 className="w-3 h-3" style={{ color: "var(--accent)" }} />
          <span>Fields and sample auto-sync — edit either pane.</span>
        </div>
      </div>

      {/* Two-pane body */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
          gap: 16,
          alignItems: "stretch",
        }}
      >
        {/* LEFT — structured fields */}
        <section
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            minHeight: 380,
          }}
        >
          <header
            style={{
              padding: "10px 16px",
              borderBottom: "1px solid var(--border)",
              background: "var(--panel-2)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div className="field-label" style={{ flex: 1 }}>Fields</div>
            <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
              {countLeafFields(schema)} field{countLeafFields(schema) === 1 ? "" : "s"}
            </div>
          </header>
          <div style={{ flex: 1, overflow: "auto", padding: "10px 16px" }}>
            {type === "object" ? (
              <RootObjectFields schema={schema} onChange={onChange} />
            ) : type === "array" ? (
              <FieldRow
                name="(items)"
                schema={schema.items ?? { type: "string" }}
                required={false}
                depth={0}
                onRename={() => {}}
                onChange={(next) => onChange({ ...schema, items: next })}
                onDelete={() => onChange({ ...schema, items: { type: "string" } })}
                onToggleRequired={() => {}}
              />
            ) : type === "string" || type === "number" || type === "integer" || type === "boolean" ? (
              <FieldRow
                name="(value)"
                schema={schema}
                required={false}
                depth={0}
                onRename={() => {}}
                onChange={onChange}
                onDelete={() => {}}
                onToggleRequired={() => {}}
              />
            ) : null}
          </div>
        </section>

        {/* RIGHT — live sample JSON */}
        <section
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            minHeight: 380,
          }}
        >
          <header
            style={{
              padding: "10px 16px",
              borderBottom: "1px solid var(--border)",
              background: "var(--panel-2)",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <FileJson className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
            <div className="field-label" style={{ flex: 1 }}>Sample JSON</div>
            <button
              type="button"
              className="btn ghost sm"
              style={{ height: 24, padding: "0 8px", fontSize: 11 }}
              title="Reset sample from current schema"
              onClick={() => {
                userEditedRef.current = false;
                setSampleText(prettyJson(samplePayload(schema)));
                setSampleError(null);
              }}
            >
              Reset
            </button>
          </header>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <textarea
              value={sampleText}
              onChange={(e) => onSampleEdit(e.target.value)}
              spellCheck={false}
              style={{
                flex: 1,
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                lineHeight: 1.55,
                padding: "12px 14px",
                background: "var(--bg)",
                color: "var(--text)",
                border: "0",
                resize: "none",
                outline: "none",
                width: "100%",
              }}
              placeholder='{ "pnr": "ABC123", "pax": [{ "id": "p1" }] }'
            />
            {sampleError ? (
              <div
                style={{
                  padding: "8px 14px",
                  fontSize: 11,
                  color: "var(--warn)",
                  background: "var(--warn-soft)",
                  borderTop: "1px solid var(--border)",
                }}
              >
                Sample not yet valid JSON: {sampleError}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {/* Raw schema fallback — collapsed by default. Power users can still
          tweak the schema JSON directly, but it's no longer the primary
          interaction. */}
      <RawSchemaCollapsible schema={schema} onChange={onChange} />
    </div>
  );
}

function RootObjectFields({ schema, onChange }: { schema: JsonSchema; onChange: (next: JsonSchema) => void }) {
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  return (
    <div className="flex flex-col">
      <div
        className="grid grid-cols-[28px_2fr_1.2fr_56px_28px] gap-2 px-1 pb-1.5"
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight: 600,
          color: "var(--text-muted)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span />
        <span>Name</span>
        <span>Type</span>
        <span>Req</span>
        <span />
      </div>
      {Object.entries(properties).length === 0 ? (
        <div
          style={{
            padding: "16px 12px",
            textAlign: "center",
            fontSize: 12,
            color: "var(--text-muted)",
            fontStyle: "italic",
          }}
        >
          No fields yet. Add one below, or paste a sample JSON on the right to seed the shape.
        </div>
      ) : (
        Object.entries(properties).map(([key, value]) => (
          <FieldRow
            key={key}
            name={key}
            schema={value}
            required={required.has(key)}
            depth={0}
            onRename={(next) => {
              if (!next || next === key || properties[next]) return;
              const newProps: Record<string, JsonSchema> = {};
              for (const [k, v] of Object.entries(properties)) {
                newProps[k === key ? next : k] = v;
              }
              const newReq = (schema.required ?? []).map((r) => (r === key ? next : r));
              onChange({ ...schema, properties: newProps, required: newReq });
            }}
            onChange={(next) => onChange({ ...schema, properties: { ...properties, [key]: next } })}
            onDelete={() => {
              const { [key]: _gone, ...rest } = properties;
              void _gone;
              onChange({
                ...schema,
                properties: rest,
                required: (schema.required ?? []).filter((r) => r !== key),
              });
            }}
            onToggleRequired={() => {
              const r = new Set(schema.required ?? []);
              if (r.has(key)) r.delete(key);
              else r.add(key);
              onChange({ ...schema, required: [...r] });
            }}
          />
        ))
      )}
      <AddField
        existingKeys={Object.keys(properties)}
        depth={0}
        onAdd={(name, fieldSchema) =>
          onChange({
            ...schema,
            properties: { ...properties, [name]: fieldSchema },
          })
        }
      />
    </div>
  );
}

/**
 * Collapsible raw-JSON editor for the schema itself. Kept around for power
 * users who want to paste a hand-authored JSON Schema, but tucked away under
 * a disclosure to keep the primary UI focused on fields + sample.
 */
function RawSchemaCollapsible({ schema, onChange }: { schema: JsonSchema; onChange: (next: JsonSchema) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string>(() => prettyJson(schema));
  const [error, setError] = useState<string | null>(null);

  // Resync text when external schema changes (e.g., the user edits the
  // sample, which infers a new schema). Skip while the textarea is focused.
  useEffect(() => {
    if (!open) return;
    setText(prettyJson(schema));
    setError(null);
  }, [schema, open]);

  return (
    <details
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
      }}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary
        style={{
          padding: "10px 16px",
          cursor: "pointer",
          fontSize: 12,
          color: "var(--text-muted)",
          listStyle: "none",
        }}
      >
        Raw JSON Schema (advanced)
      </summary>
      <div style={{ padding: "0 16px 16px" }}>
        <textarea
          value={text}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            try {
              const parsed = JSON.parse(next);
              const v = validateSchemaShape(parsed);
              if (!v.ok) {
                setError(v.error);
                return;
              }
              setError(null);
              onChange(parsed);
            } catch (err) {
              setError((err as Error).message);
            }
          }}
          spellCheck={false}
          rows={14}
          style={{
            width: "100%",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            lineHeight: 1.5,
            padding: "10px 12px",
            background: "var(--bg)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 7,
            outline: "none",
            resize: "vertical",
          }}
        />
        {error ? (
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--warn)" }}>{error}</div>
        ) : null}
      </div>
    </details>
  );
}

// ── helpers ────────────────────────────────────────────────────────────

function pickType(schema: JsonSchema): JsonSchemaType | undefined {
  if (Array.isArray(schema.type)) return schema.type.find((t) => t !== "null") ?? schema.type[0];
  return schema.type;
}

function retypeRoot(prev: JsonSchema, t: JsonSchemaType): JsonSchema {
  const next: JsonSchema = { ...prev, type: t };
  if (t === "object") {
    next.properties = prev.properties ?? {};
    delete next.items;
  } else if (t === "array") {
    next.items = prev.items ?? { type: "string" };
    delete next.properties;
    delete next.required;
  } else {
    delete next.properties;
    delete next.required;
    delete next.items;
  }
  return next;
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/**
 * Count leaf-only fields for the header "N fields" stat — descends into
 * objects/arrays so nested schemas don't all read as "1 field".
 */
function countLeafFields(schema: JsonSchema): number {
  const t = pickType(schema);
  if (t === "object") {
    let n = 0;
    for (const v of Object.values(schema.properties ?? {})) {
      n += countLeafFields(v);
    }
    return n || 1;
  }
  if (t === "array" && schema.items) return countLeafFields(schema.items);
  return 1;
}
