"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Trash2, Plus } from "lucide-react";
import type { JsonSchema, JsonSchemaType } from "@/lib/types";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

const TYPES: JsonSchemaType[] = ["string", "number", "integer", "boolean", "object", "array", "null"];

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

  return (
    <div
      className="flex flex-col"
      style={{
        marginLeft: depth * 14,
        borderLeft: depth > 0 ? "1px dashed var(--color-border-strong)" : undefined,
        paddingLeft: depth > 0 ? 10 : 0,
      }}
    >
      <div className="grid grid-cols-[auto_2fr_1.2fr_auto_auto] gap-2 items-center py-1.5">
        <button
          onClick={() => hasNested && setOpen(!open)}
          className="w-5 h-5 flex items-center justify-center rounded"
          style={{ visibility: hasNested ? "visible" : "hidden", color: "var(--color-fg-muted)" }}
        >
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
        <Input
          value={name}
          onChange={(e) => onRename(e.target.value)}
          placeholder="fieldName"
          className="mono"
        />
        <Select
          value={type ?? "string"}
          onChange={(e) => onChange(retypeSchema(schema, e.target.value as JsonSchemaType))}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
        <label className="text-[11px] flex items-center gap-1.5 select-none cursor-pointer" title="Toggle required">
          <input type="checkbox" checked={required} onChange={onToggleRequired} className="cursor-pointer" />
          <span style={{ color: "var(--color-fg-muted)" }}>req</span>
        </label>
        <button
          onClick={onDelete}
          className="w-7 h-7 flex items-center justify-center rounded"
          style={{ color: "var(--color-fg-muted)" }}
          title="Remove field"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {open ? (
        <div className="ml-7 mb-2 flex flex-col gap-1.5">
          <DetailsRow label="description">
            <Input
              value={schema.description ?? ""}
              onChange={(e) => onChange({ ...schema, description: e.target.value || undefined })}
            />
          </DetailsRow>
          {type === "string" ? (
            <>
              <DetailsRow label="format">
                <Select
                  value={schema.format ?? ""}
                  onChange={(e) => onChange({ ...schema, format: e.target.value || undefined })}
                >
                  <option value="">(none)</option>
                  <option value="date">date</option>
                  <option value="date-time">date-time</option>
                  <option value="email">email</option>
                  <option value="uri">uri</option>
                  <option value="uuid">uuid</option>
                </Select>
              </DetailsRow>
              <DetailsRow label="enum (csv)">
                <Input
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
                />
              </DetailsRow>
            </>
          ) : null}
          {type === "number" || type === "integer" ? (
            <>
              <DetailsRow label="min">
                <Input
                  type="number"
                  value={schema.minimum ?? ""}
                  onChange={(e) => onChange({ ...schema, minimum: e.target.value === "" ? undefined : Number(e.target.value) })}
                />
              </DetailsRow>
              <DetailsRow label="max">
                <Input
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
        <NestedObject
          schema={schema}
          depth={depth + 1}
          onChange={onChange}
        />
      ) : null}

      {open && type === "array" ? (
        <NestedArray
          schema={schema}
          depth={depth + 1}
          onChange={onChange}
        />
      ) : null}
    </div>
  );
}

function DetailsRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-2 items-center text-[12px]">
      <label style={{ color: "var(--color-fg-muted)" }}>{label}</label>
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
        onAdd={(name, t) =>
          onChange({
            ...schema,
            properties: { ...properties, [name]: { type: t } },
          })
        }
      />
    </div>
  );
}

function NestedArray({ schema, depth, onChange }: { schema: JsonSchema; depth: number; onChange: (next: JsonSchema) => void }) {
  const items = schema.items ?? { type: "string" };
  return (
    <div className="flex flex-col" style={{ marginLeft: depth * 14, borderLeft: "1px dashed var(--color-border-strong)", paddingLeft: 10 }}>
      <div className="text-[11px] py-1" style={{ color: "var(--color-fg-muted)" }}>items</div>
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

export function AddField({ existingKeys, depth, onAdd }: { existingKeys: string[]; depth: number; onAdd: (name: string, type: JsonSchemaType) => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<JsonSchemaType>("string");
  const taken = existingKeys.includes(name);
  const disabled = !name.trim() || taken;
  return (
    <div className="grid grid-cols-[auto_2fr_1.2fr_auto] gap-2 items-center py-1.5" style={{ marginLeft: depth * 14 + 27 }}>
      <span className="w-1" />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !disabled) {
            onAdd(name.trim(), type);
            setName("");
          }
        }}
        placeholder="add field…"
        invalid={taken}
      />
      <Select value={type} onChange={(e) => setType(e.target.value as JsonSchemaType)}>
        {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </Select>
      <button
        onClick={() => { if (!disabled) { onAdd(name.trim(), type); setName(""); } }}
        disabled={disabled}
        className="w-7 h-7 flex items-center justify-center rounded disabled:opacity-30"
        style={{ color: "var(--color-fg)", border: "1px solid var(--color-border-strong)" }}
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function pickType(schema: JsonSchema): JsonSchemaType | undefined {
  if (Array.isArray(schema.type)) return schema.type.find((t) => t !== "null") ?? schema.type[0];
  return schema.type;
}

function retypeSchema(prev: JsonSchema, t: JsonSchemaType): JsonSchema {
  const next: JsonSchema = { type: t };
  if (prev.description) next.description = prev.description;
  if (t === "object") next.properties = prev.properties ?? {};
  if (t === "array") next.items = prev.items ?? { type: "string" };
  return next;
}
