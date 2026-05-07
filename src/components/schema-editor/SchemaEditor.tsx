"use client";

import { useMemo, useState } from "react";
import { Eye, FileJson, FlaskConical } from "lucide-react";
import type { JsonSchema, JsonSchemaType } from "@/lib/types";
import { inferSchema } from "@/lib/schema/infer";
import { validateSchemaShape } from "@/lib/schema/validate";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/Select";
import { FieldRow, AddField } from "./FieldRow";

type Tab = "visual" | "sample" | "raw";

type Props = {
  schema: JsonSchema;
  onChange: (next: JsonSchema) => void;
};

const TOP_TYPES: JsonSchemaType[] = ["object", "array", "string", "number", "integer", "boolean"];

export function SchemaEditor({ schema, onChange }: Props) {
  const [tab, setTab] = useState<Tab>("visual");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1 border-b" style={{ borderColor: "var(--color-border)" }}>
        <TabBtn active={tab === "visual"} onClick={() => setTab("visual")} icon={<Eye className="w-3.5 h-3.5" />}>Visual</TabBtn>
        <TabBtn active={tab === "sample"} onClick={() => setTab("sample")} icon={<FlaskConical className="w-3.5 h-3.5" />}>From sample</TabBtn>
        <TabBtn active={tab === "raw"} onClick={() => setTab("raw")} icon={<FileJson className="w-3.5 h-3.5" />}>Raw JSON</TabBtn>
      </div>
      {tab === "visual" ? <VisualTab schema={schema} onChange={onChange} /> : null}
      {tab === "sample" ? <SampleTab onApply={onChange} /> : null}
      {tab === "raw" ? <RawTab schema={schema} onChange={onChange} /> : null}
    </div>
  );
}

function TabBtn({ active, children, icon, onClick }: { active: boolean; children: React.ReactNode; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 h-8 text-[12.5px] flex items-center gap-1.5 -mb-px"
      style={{
        color: active ? "var(--color-fg)" : "var(--color-fg-muted)",
        borderBottom: active ? "2px solid var(--color-fg)" : "2px solid transparent",
        fontWeight: active ? 500 : 400,
      }}
    >
      {icon}
      {children}
    </button>
  );
}

function VisualTab({ schema, onChange }: { schema: JsonSchema; onChange: (next: JsonSchema) => void }) {
  const type = pickType(schema) ?? "object";
  return (
    <div className="flex flex-col gap-3 py-2">
      <div className="flex items-center gap-3 text-[12.5px]">
        <span style={{ color: "var(--color-fg-muted)" }}>Top-level type</span>
        <Select
          value={type}
          onChange={(e) => onChange(retypeRoot(schema, e.target.value as JsonSchemaType))}
          style={{ width: 160 }}
        >
          {TOP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      </div>

      {type === "object" ? <RootObjectFields schema={schema} onChange={onChange} /> : null}
      {type === "array" ? (
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
      ) : null}
      {(type === "string" || type === "number" || type === "integer" || type === "boolean") ? (
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
  );
}

function RootObjectFields({ schema, onChange }: { schema: JsonSchema; onChange: (next: JsonSchema) => void }) {
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-[auto_2fr_1.2fr_auto_auto] gap-2 px-1 text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--color-fg-dim)" }}>
        <span />
        <span>Name</span>
        <span>Type</span>
        <span>Req</span>
        <span />
      </div>
      {Object.entries(properties).map(([key, value]) => (
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
      ))}
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

function SampleTab({ onApply }: { onApply: (next: JsonSchema) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inferred = useMemo(() => {
    setError(null);
    if (!text.trim()) return null;
    try {
      const parsed = JSON.parse(text);
      return inferSchema(parsed);
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [text]);

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] uppercase tracking-wider" style={{ color: "var(--color-fg-dim)" }}>Sample JSON</label>
        <textarea
          className="mono text-[12px] h-72 p-2.5 rounded resize-none"
          style={{ background: "var(--color-bg)", border: "1px solid var(--color-border-strong)", color: "var(--color-fg)" }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='{"pnr":"ABC123","cabin":"Y","pax":[{"id":"p1","tier":"GOLD"}]}'
        />
        {error ? <span className="text-[11px]" style={{ color: "var(--color-fail)" }}>{error}</span> : null}
        <div className="flex justify-end pt-1">
          <Button
            variant="default"
            size="sm"
            disabled={!inferred}
            onClick={() => inferred && onApply(inferred)}
          >
            Apply inferred schema
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] uppercase tracking-wider" style={{ color: "var(--color-fg-dim)" }}>Inferred schema</label>
        <pre
          className="mono text-[11.5px] h-72 p-2.5 rounded overflow-auto whitespace-pre-wrap"
          style={{ background: "var(--color-bg-soft)", border: "1px solid var(--color-border)", color: "var(--color-fg-soft)" }}
        >
          {inferred ? JSON.stringify(inferred, null, 2) : "(paste JSON to preview)"}
        </pre>
      </div>
    </div>
  );
}

function RawTab({ schema, onChange }: { schema: JsonSchema; onChange: (next: JsonSchema) => void }) {
  const [text, setText] = useState(JSON.stringify(schema, null, 2));
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2 py-2">
      <textarea
        className="mono text-[12px] h-96 p-2.5 rounded resize-none"
        style={{ background: "var(--color-bg)", border: "1px solid var(--color-border-strong)", color: "var(--color-fg)" }}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const parsed = JSON.parse(e.target.value);
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
      />
      {error ? <span className="text-[11px]" style={{ color: "var(--color-fail)" }}>{error}</span> : null}
    </div>
  );
}

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
