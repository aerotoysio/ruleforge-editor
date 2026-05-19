"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, X, Plus } from "lucide-react";
import type { JsonSchema, JsonSchemaType } from "@/lib/types";

/**
 * Tree-row field editor for a JSON Schema property.
 *
 * Visual: one grid row per field, mirroring the table style used elsewhere
 * (`.struct-rows`). Expanding the row reveals format/enum/min/max details
 * inline; nested object/array fields recurse.
 */

const TYPES: JsonSchemaType[] = ["string", "number", "integer", "boolean", "object", "array", "null"];

// User-facing type picker. We expand the JSON Schema type set with a few
// common "string with format" pseudo-types — date / date-time / email — so
// authors don't have to know that a date is "string + format=date" under
// the hood. The schema written to disk is still a real JSON Schema fragment.
type PickType = JsonSchemaType | "date" | "date-time" | "email";

const PICK_TYPES: { value: PickType; label: string }[] = [
  { value: "string",    label: "text" },
  { value: "number",    label: "number" },
  { value: "integer",   label: "integer" },
  { value: "boolean",   label: "yes / no" },
  { value: "date",      label: "date" },
  { value: "date-time", label: "date-time" },
  { value: "email",     label: "email" },
  { value: "object",    label: "object" },
  { value: "array",     label: "list" },
];

function schemaForPickType(t: PickType): JsonSchema {
  if (t === "date" || t === "date-time" || t === "email") {
    return { type: "string", format: t };
  }
  if (t === "object") return { type: "object", properties: {} };
  if (t === "array") return { type: "array", items: { type: "string" } };
  return { type: t };
}

function detectPickType(schema: JsonSchema): PickType {
  const t = pickType(schema);
  if (t === "string" && schema.format === "date") return "date";
  if (t === "string" && schema.format === "date-time") return "date-time";
  if (t === "string" && schema.format === "email") return "email";
  return (t ?? "string") as PickType;
}

type Props = {
  name: string;
  schema: JsonSchema;
  required: boolean;
  depth: number;
  onRename: (next: string) => void;
  onChange: (next: JsonSchema) => void;
  onDelete: () => void;
  onToggleRequired: () => void;
};

export function FieldRow({ name, schema, required, depth, onRename, onChange, onDelete, onToggleRequired }: Props) {
  const [open, setOpen] = useState(false);
  const type = pickType(schema);
  const hasNested = type === "object" || type === "array";
  const userType = detectPickType(schema);

  return (
    <div
      style={{
        marginLeft: depth * 16,
        borderLeft: depth > 0 ? "1px dashed var(--border-strong)" : undefined,
        paddingLeft: depth > 0 ? 10 : 0,
      }}
    >
      <div
        className="grid items-center"
        style={{
          gridTemplateColumns: "28px 2fr 1.2fr 56px 28px",
          gap: 8,
          padding: "6px 0",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <button
          type="button"
          onClick={() => hasNested && setOpen(!open)}
          style={{
            width: 22,
            height: 22,
            display: "inline-grid",
            placeItems: "center",
            borderRadius: 4,
            background: "transparent",
            border: 0,
            cursor: hasNested ? "pointer" : "default",
            color: "var(--text-muted)",
            visibility: hasNested ? "visible" : "hidden",
          }}
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
        <input
          className="input mono"
          style={{ fontFamily: "var(--font-mono)", height: 28, fontSize: 12 }}
          value={name}
          onChange={(e) => onRename(e.target.value)}
          placeholder="fieldName"
        />
        <select
          className="input"
          style={{ height: 28, fontSize: 12 }}
          value={userType}
          onChange={(e) => onChange(retypePickSchema(schema, e.target.value as PickType))}
        >
          {PICK_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 10.5,
            color: "var(--text-muted)",
            cursor: "pointer",
            userSelect: "none",
            justifyContent: "center",
          }}
          title="Required field"
        >
          <input
            type="checkbox"
            checked={required}
            onChange={onToggleRequired}
            style={{ cursor: "pointer" }}
          />
          req
        </label>
        <button
          type="button"
          onClick={onDelete}
          className="x"
          style={{
            width: 22,
            height: 22,
            display: "inline-grid",
            placeItems: "center",
            borderRadius: 4,
            background: "transparent",
            border: 0,
            color: "var(--text-muted)",
            cursor: "pointer",
          }}
          title="Remove field"
          aria-label="Remove field"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {open ? (
        <div
          style={{
            marginLeft: 30,
            padding: "10px 12px 10px 0",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <DetailsRow label="description">
            <input
              className="input"
              style={{ height: 28, fontSize: 12 }}
              value={schema.description ?? ""}
              onChange={(e) => onChange({ ...schema, description: e.target.value || undefined })}
              placeholder="What does this field represent?"
            />
          </DetailsRow>
          {type === "string" ? (
            <>
              <DetailsRow label="format">
                <select
                  className="input"
                  style={{ height: 28, fontSize: 12 }}
                  value={schema.format ?? ""}
                  onChange={(e) => onChange({ ...schema, format: e.target.value || undefined })}
                >
                  <option value="">(none)</option>
                  <option value="date">date</option>
                  <option value="date-time">date-time</option>
                  <option value="email">email</option>
                  <option value="uri">uri</option>
                  <option value="uuid">uuid</option>
                </select>
              </DetailsRow>
              <DetailsRow label="enum (csv)">
                <input
                  className="input"
                  style={{ height: 28, fontSize: 12 }}
                  value={(schema.enum ?? []).join(", ")}
                  onChange={(e) =>
                    onChange({
                      ...schema,
                      enum: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="ADT, CHD, INF"
                />
              </DetailsRow>
            </>
          ) : null}
          {(type === "number" || type === "integer") ? (
            <>
              <DetailsRow label="min">
                <input
                  className="input"
                  style={{ height: 28, fontSize: 12 }}
                  type="number"
                  value={schema.minimum ?? ""}
                  onChange={(e) => onChange({ ...schema, minimum: e.target.value === "" ? undefined : Number(e.target.value) })}
                />
              </DetailsRow>
              <DetailsRow label="max">
                <input
                  className="input"
                  style={{ height: 28, fontSize: 12 }}
                  type="number"
                  value={schema.maximum ?? ""}
                  onChange={(e) => onChange({ ...schema, maximum: e.target.value === "" ? undefined : Number(e.target.value) })}
                />
              </DetailsRow>
            </>
          ) : null}
        </div>
      ) : null}

      {open && type === "object" ? (
        <NestedObject schema={schema} depth={depth + 1} onChange={onChange} />
      ) : null}

      {open && type === "array" ? (
        <NestedArray schema={schema} depth={depth + 1} onChange={onChange} />
      ) : null}
    </div>
  );
}

function DetailsRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className="grid items-center"
      style={{ gridTemplateColumns: "80px 1fr", gap: 10, fontSize: 11.5 }}
    >
      <label style={{ color: "var(--text-muted)" }}>{label}</label>
      {children}
    </div>
  );
}

function NestedObject({ schema, depth, onChange }: { schema: JsonSchema; depth: number; onChange: (next: JsonSchema) => void }) {
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  return (
    <div className="flex flex-col">
      {Object.entries(properties).map(([key, value]) => (
        <FieldRow
          key={key}
          name={key}
          schema={value}
          required={required.has(key)}
          depth={depth}
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
      ))}
      <AddField
        depth={depth}
        existingKeys={Object.keys(properties)}
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

function NestedArray({ schema, depth, onChange }: { schema: JsonSchema; depth: number; onChange: (next: JsonSchema) => void }) {
  const items = schema.items ?? { type: "string" };
  return (
    <div
      style={{
        marginLeft: depth * 16,
        borderLeft: "1px dashed var(--border-strong)",
        paddingLeft: 10,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          padding: "8px 0 4px",
        }}
      >
        items
      </div>
      <FieldRow
        name="(items)"
        schema={items}
        required={false}
        depth={depth}
        onRename={() => {}}
        onChange={(next) => onChange({ ...schema, items: next })}
        onDelete={() => onChange({ ...schema, items: { type: "string" } })}
        onToggleRequired={() => {}}
      />
    </div>
  );
}

export function AddField({ existingKeys, depth, onAdd }: { existingKeys: string[]; depth: number; onAdd: (name: string, schema: JsonSchema) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<PickType>("string");
  const taken = existingKeys.includes(name);
  const disabled = !name.trim() || taken;
  return (
    <div
      className="grid items-center"
      style={{
        gridTemplateColumns: "28px 2fr 1.2fr 28px",
        gap: 8,
        padding: "8px 0",
        marginLeft: depth * 16,
      }}
    >
      <span />
      <input
        className="input mono"
        style={{
          fontFamily: "var(--font-mono)",
          height: 28,
          fontSize: 12,
          borderStyle: taken ? "solid" : "dashed",
          borderColor: taken ? "var(--danger)" : "var(--border)",
        }}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !disabled) {
            onAdd(name.trim(), schemaForPickType(type));
            setName("");
          }
        }}
        placeholder="+ add field…"
      />
      <select
        className="input"
        style={{ height: 28, fontSize: 12 }}
        value={type}
        onChange={(e) => setType(e.target.value as PickType)}
      >
        {PICK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <button
        type="button"
        onClick={() => {
          if (!disabled) {
            onAdd(name.trim(), schemaForPickType(type));
            setName("");
          }
        }}
        disabled={disabled}
        style={{
          width: 22,
          height: 22,
          display: "inline-grid",
          placeItems: "center",
          borderRadius: 4,
          background: disabled ? "transparent" : "var(--accent)",
          color: disabled ? "var(--text-faint)" : "var(--accent-fg)",
          border: "1px solid",
          borderColor: disabled ? "var(--border)" : "var(--accent)",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
        title="Add field"
        aria-label="Add field"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
}

function pickType(schema: JsonSchema): JsonSchemaType | undefined {
  if (Array.isArray(schema.type)) return schema.type.find((t) => t !== "null") ?? schema.type[0];
  return schema.type;
}

function retypePickSchema(prev: JsonSchema, t: PickType): JsonSchema {
  const next = schemaForPickType(t);
  if (prev.description) next.description = prev.description;
  if (t === "object") next.properties = prev.properties ?? {};
  if (t === "array") next.items = prev.items ?? { type: "string" };
  return next;
}

// Re-export so SchemaEditor's TYPES list is the same source of truth.
export { TYPES, PICK_TYPES };
