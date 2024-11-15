"use client";

import { useMemo, useState } from "react";
import { Plus, X, Type, Wand2, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/Input";
import { PathPicker } from "@/components/path-picker/PathPicker";
import { cn } from "@/lib/utils";
import type { JsonSchema } from "@/lib/types";

/**
 * Authoring control for an object-shaped literal value (used by the
 * "Starter value" / constant node, or any port whose type is object/any).
 *
 * The user adds named fields. Each field's value is one of:
 *   - literal — a typed value (string/number/boolean)
 *   - path    — a JSONPath that gets interpolated at evaluation time
 *   - context — an iteration-frame variable (e.g. $pax.id)
 *
 * What we emit is a plain JSON object where path / context values are
 * stored as string interpolations the engine already understands:
 *   - "$pax.id"        for context bindings
 *   - "${$.foo.bar}"   for path bindings
 *   - "literal value"  / 42 / true   for literals
 *
 * This mirrors how the offer-tax rule's "Tax line shell" was previously
 * authored as raw JSON ({ "paxId": "$pax.id", … }).
 */

type FieldKind = "literal-string" | "literal-number" | "literal-boolean" | "path" | "context";

type Field = {
  key: string;
  kind: FieldKind;
  value: unknown;
};

type Props = {
  value: Record<string, unknown> | unknown;
  onChange: (next: Record<string, unknown>) => void;
  inputSchema: JsonSchema;
};

const KIND_OPTIONS: { kind: FieldKind; label: string; icon: typeof Type }[] = [
  { kind: "literal-string",  label: "text",    icon: Type  },
  { kind: "literal-number",  label: "number",  icon: Type  },
  { kind: "literal-boolean", label: "yes/no",  icon: Type  },
  { kind: "path",            label: "path",    icon: Wand2 },
  { kind: "context",         label: "context", icon: Quote },
];

export function ObjectShapeEditor({ value, onChange, inputSchema }: Props) {
  // Convert the persisted object into our editing model
  const initialFields = useMemo<Field[]>(() => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    return Object.entries(value as Record<string, unknown>).map(([key, v]) => detectField(key, v));
  }, [value]);

  const [fields, setFields] = useState<Field[]>(initialFields);

  // Sync up if the external value changes (e.g. node-instance reselected)
  // Note: this is a one-way sync from props → local. Local edits flush via emit().
  useMemo(() => setFields(initialFields), [initialFields]);

  function emit(next: Field[]) {
    setFields(next);
    const out: Record<string, unknown> = {};
    for (const f of next) {
      if (!f.key.trim()) continue;
      out[f.key] = serializeField(f);
    }
    onChange(out);
  }

  function addField() {
    emit([...fields, { key: `field${fields.length + 1}`, kind: "literal-string", value: "" }]);
  }

  function removeField(idx: number) {
    emit(fields.filter((_, i) => i !== idx));
  }

  function updateField(idx: number, patch: Partial<Field>) {
    emit(fields.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  }

  function changeKind(idx: number, kind: FieldKind) {
    const reset = kindDefaultValue(kind);
    updateField(idx, { kind, value: reset });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-medium">
          Fields ({fields.length})
        </span>
        <Button variant="ghost" size="xs" onClick={addField}>
          <Plus className="w-2.5 h-2.5" /> Add field
        </Button>
      </div>

      {fields.length === 0 ? (
        <div className="text-[11.5px] text-muted-foreground italic px-1 py-2">
          No fields yet — click <em>Add field</em> to define the shape of this value.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {fields.map((f, i) => (
            <FieldRow
              key={i}
              field={f}
              inputSchema={inputSchema}
              onChangeKey={(key) => updateField(i, { key })}
              onChangeKind={(kind) => changeKind(i, kind)}
              onChangeValue={(value) => updateField(i, { value })}
              onRemove={() => removeField(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FieldRow({
  field,
  inputSchema,
  onChangeKey,
  onChangeKind,
  onChangeValue,
  onRemove,
}: {
  field: Field;
  inputSchema: JsonSchema;
  onChangeKey: (key: string) => void;
  onChangeKind: (kind: FieldKind) => void;
  onChangeValue: (value: unknown) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-md border bg-background p-2 flex flex-col gap-1.5">
      <div className="grid grid-cols-[1fr_auto_auto] gap-1.5 items-center">
        <Input
          value={field.key}
          onChange={(e) => onChangeKey(e.target.value)}
          placeholder="fieldName"
          className="font-mono text-[12px]"
        />
        <KindPicker value={field.kind} onChange={onChangeKind} />
        <Button variant="ghost" size="icon-sm" onClick={onRemove} title="Remove field">
          <X className="w-3 h-3" />
        </Button>
      </div>
      <FieldValue field={field} inputSchema={inputSchema} onChange={onChangeValue} />
    </div>
  );
}

function KindPicker({ value, onChange }: { value: FieldKind; onChange: (k: FieldKind) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as FieldKind)}
      className="h-7 text-[11px] px-1.5 rounded border border-border bg-background text-foreground"
    >
      {KIND_OPTIONS.map((k) => (
        <option key={k.kind} value={k.kind}>{k.label}</option>
      ))}
    </select>
  );
}

function FieldValue({
  field,
  inputSchema,
  onChange,
}: {
  field: Field;
  inputSchema: JsonSchema;
  onChange: (value: unknown) => void;
}) {
  if (field.kind === "literal-string") {
    return (
      <Input
        value={typeof field.value === "string" ? field.value : ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="text value"
      />
    );
  }
  if (field.kind === "literal-number") {
    return (
      <Input
        type="number"
        value={typeof field.value === "number" ? field.value : ""}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        placeholder="0"
      />
    );
  }
  if (field.kind === "literal-boolean") {
    const isTrue = field.value === true;
    return (
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={cn(
            "px-2.5 h-7 text-[11px] font-medium rounded border transition-colors",
            isTrue
              ? "bg-foreground text-background border-foreground"
              : "bg-card text-foreground border-border hover:border-foreground/30",
          )}
        >
          yes
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={cn(
            "px-2.5 h-7 text-[11px] font-medium rounded border transition-colors",
            !isTrue
              ? "bg-foreground text-background border-foreground"
              : "bg-card text-foreground border-border hover:border-foreground/30",
          )}
        >
          no
        </button>
      </div>
    );
  }
  if (field.kind === "path") {
    return (
      <PathPicker
        schema={inputSchema}
        value={typeof field.value === "string" ? field.value : ""}
        onChange={(p) => onChange(p)}
        placeholder="$.field.path"
      />
    );
  }
  if (field.kind === "context") {
    return (
      <Input
        value={typeof field.value === "string" ? field.value : ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder="pax.id  or  ctx.computedAge"
      />
    );
  }
  return null;
}

// ---------- helpers ----------

function detectField(key: string, v: unknown): Field {
  if (typeof v === "string") {
    if (v.startsWith("$pax.") || v.startsWith("$ctx.") || v.startsWith("$bound.") || v.startsWith("$segment.")) {
      return { key, kind: "context", value: v.slice(1) };
    }
    if (v.startsWith("$.") || v.startsWith("${")) {
      return { key, kind: "path", value: v.startsWith("${") ? v.slice(2, -1) : v };
    }
    return { key, kind: "literal-string", value: v };
  }
  if (typeof v === "number") return { key, kind: "literal-number", value: v };
  if (typeof v === "boolean") return { key, kind: "literal-boolean", value: v };
  return { key, kind: "literal-string", value: typeof v === "object" ? JSON.stringify(v) : String(v) };
}

function serializeField(f: Field): unknown {
  if (f.kind === "literal-string") return typeof f.value === "string" ? f.value : "";
  if (f.kind === "literal-number") return typeof f.value === "number" ? f.value : 0;
  if (f.kind === "literal-boolean") return f.value === true;
  if (f.kind === "path") {
    const p = typeof f.value === "string" ? f.value : "";
    return p; // store as plain "$.foo.bar" — engine interpolation rules apply
  }
  if (f.kind === "context") {
    const k = typeof f.value === "string" ? f.value : "";
    return k.startsWith("$") ? k : `$${k}`;
  }
  return null;
}

function kindDefaultValue(kind: FieldKind): unknown {
  if (kind === "literal-string") return "";
  if (kind === "literal-number") return 0;
  if (kind === "literal-boolean") return false;
  return "";
}
