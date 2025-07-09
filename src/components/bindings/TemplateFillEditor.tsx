"use client";

import { useEffect, useMemo, useState } from "react";
import { useTemplatesStore } from "@/lib/store/templates-store";
import type {
  JsonSchema,
  OutputTemplate,
  OutputTemplateField,
  PortBinding,
} from "@/lib/types";
import { walkSchema, type SchemaPathNode } from "@/lib/schema/path-walker";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

type Props = {
  value: Extract<PortBinding, { kind: "template-fill" }>;
  onChange: (b: Extract<PortBinding, { kind: "template-fill" }>) => void;
  /** Used by the path mode so the user can browse fields from the rule's input. */
  inputSchema: JsonSchema;
};

/**
 * Authors a `template-fill` binding: pick a template, then bind each of its
 * fields with a literal, a path into the request, or a context key. Fields
 * default to the template's `default` value when set so the user only has to
 * touch the variable bits.
 */
export function TemplateFillEditor({ value, onChange, inputSchema }: Props) {
  const templates = useTemplatesStore((s) => s.templates);
  const loaded = useTemplatesStore((s) => s.loaded);
  const load = useTemplatesStore((s) => s.load);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const tpl = templates.find((t) => t.id === value.templateId);

  function setTemplate(id: string) {
    const next = templates.find((t) => t.id === id);
    onChange({
      kind: "template-fill",
      templateId: id,
      // Reset field bindings when the template changes — fields are unique per
      // template, so old bindings would point at fields that no longer exist.
      // Pre-seed any field with a baked-in default as a literal binding so the
      // user can see the constant fields are already taken care of.
      fields: next ? seedFromDefaults(next.fields) : {},
    });
  }

  function setField(name: string, b: PortBinding | null) {
    const nextFields = { ...value.fields };
    if (b === null) delete nextFields[name];
    else nextFields[name] = b;
    onChange({ ...value, fields: nextFields });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Template picker */}
      <div className="grid grid-cols-[80px_1fr] gap-2 items-center">
        <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-medium">
          Template
        </span>
        <select
          value={value.templateId}
          onChange={(e) => setTemplate(e.target.value)}
          className="h-8 text-[12px] px-2 rounded border border-border bg-background"
        >
          <option value="">— choose a template —</option>
          {groupByCategory(templates).map(([cat, items]) => (
            <optgroup key={cat} label={cat}>
              {items.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {tpl ? (
        <>
          {tpl.description ? (
            <p className="text-[11.5px] text-muted-foreground -mt-1 leading-relaxed">{tpl.description}</p>
          ) : null}
          <div className="rounded-md border bg-card divide-y">
            {tpl.fields.length === 0 ? (
              <div className="px-3 py-4 text-[12px] text-muted-foreground italic">
                This template has no fields yet. Add some in the Templates editor.
              </div>
            ) : (
              tpl.fields.map((field) => (
                <FieldRow
                  key={field.name}
                  field={field}
                  binding={value.fields[field.name]}
                  onChange={(b) => setField(field.name, b)}
                  inputSchema={inputSchema}
                />
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Per-field row — a tab toggle (literal / path / context) plus the matching editor.
// ----------------------------------------------------------------------------

type FieldKind = "literal" | "path" | "context" | "unset";

function FieldRow({
  field,
  binding,
  onChange,
  inputSchema,
}: {
  field: OutputTemplateField;
  binding: PortBinding | undefined;
  onChange: (b: PortBinding | null) => void;
  inputSchema: JsonSchema;
}) {
  const currentKind: FieldKind = binding
    ? (binding.kind === "literal" || binding.kind === "path" || binding.kind === "context")
      ? binding.kind
      : "unset"
    : "unset";

  const [activeKind, setActiveKind] = useState<FieldKind>(currentKind === "unset" ? "literal" : currentKind);

  // Keep the tab in sync if the binding flips kind from outside (e.g. template
  // change reseeded a default literal).
  useEffect(() => {
    if (currentKind !== "unset") setActiveKind(currentKind);
  }, [currentKind]);

  return (
    <div className="grid grid-cols-[160px_1fr] gap-3 px-3 py-2.5 items-start">
      <div className="flex flex-col gap-0.5 pt-1.5 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[12.5px] font-mono font-medium text-foreground truncate" title={field.name}>
            {field.name}
          </span>
          {field.required ? (
            <span className="text-[9px] uppercase tracking-wider px-1 h-3.5 inline-flex items-center rounded bg-red-50 text-red-700 border border-red-200 font-medium dark:bg-red-950/30 dark:text-red-300 dark:border-red-900">
              req
            </span>
          ) : null}
        </div>
        <span className="text-[10.5px] text-muted-foreground font-mono">{field.type}</span>
        {field.description ? (
          <span className="text-[10.5px] text-muted-foreground/80 leading-snug mt-0.5 line-clamp-3">
            {field.description}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5 min-w-0">
        {/* Tab toggle: Literal / Path / Context */}
        <div className="inline-flex rounded-md border bg-muted/40 p-0.5 self-start">
          {(["literal", "path", "context"] as FieldKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setActiveKind(k);
                if (k === "literal" && binding?.kind !== "literal") {
                  onChange({ kind: "literal", value: field.default ?? defaultLiteralFor(field.type) });
                } else if (k === "path" && binding?.kind !== "path") {
                  onChange({ kind: "path", path: "" });
                } else if (k === "context" && binding?.kind !== "context") {
                  onChange({ kind: "context", key: "" });
                }
              }}
              className={cn(
                "px-2.5 h-6 text-[11px] font-medium rounded transition-colors",
                activeKind === k
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {k === "literal" ? "Value" : k === "path" ? "From request" : "From context"}
            </button>
          ))}
          {binding ? (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="px-2 h-6 text-[11px] text-muted-foreground hover:text-destructive transition-colors"
              title="Clear this field"
            >
              ✕
            </button>
          ) : null}
        </div>

        {activeKind === "literal" ? (
          <LiteralValueInput field={field} binding={binding} onChange={onChange} />
        ) : activeKind === "path" ? (
          <PathPicker
            schema={inputSchema}
            value={binding?.kind === "path" ? binding.path : ""}
            onPick={(p) => onChange({ kind: "path", path: p })}
            field={field}
          />
        ) : (
          <Input
            value={binding?.kind === "context" ? binding.key : ""}
            onChange={(e) => onChange({ kind: "context", key: e.target.value })}
            placeholder="$pax.id, $ctx.tenantId, …"
            className="h-8 text-[12px] font-mono"
          />
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Editors for each field-kind
// ----------------------------------------------------------------------------

function LiteralValueInput({
  field,
  binding,
  onChange,
}: {
  field: OutputTemplateField;
  binding: PortBinding | undefined;
  onChange: (b: PortBinding) => void;
}) {
  const lit = binding?.kind === "literal" ? binding.value : undefined;

  if (field.type === "boolean") {
    const v = typeof lit === "boolean" ? lit : undefined;
    return (
      <div className="flex gap-1.5">
        {[true, false].map((opt) => (
          <button
            key={String(opt)}
            type="button"
            onClick={() => onChange({ kind: "literal", value: opt })}
            className={cn(
              "h-7 px-3 text-[11.5px] font-medium rounded-md border",
              v === opt ? "bg-foreground text-background border-foreground" : "bg-card border-border hover:border-foreground/30",
            )}
          >
            {opt ? "Yes" : "No"}
          </button>
        ))}
      </div>
    );
  }
  if (field.type === "number" || field.type === "integer") {
    return (
      <Input
        type="number"
        value={typeof lit === "number" ? lit : ""}
        onChange={(e) => onChange({ kind: "literal", value: e.target.value === "" ? "" : Number(e.target.value) })}
        placeholder={field.examples?.[0] != null ? String(field.examples[0]) : "0"}
        className="h-8 text-[12px]"
      />
    );
  }
  if (field.type === "string-array" || field.type === "number-array") {
    const arr = Array.isArray(lit) ? (lit as Array<string | number>).join("\n") : "";
    return (
      <textarea
        rows={3}
        value={arr}
        onChange={(e) => {
          const items = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean);
          const value = field.type === "number-array" ? items.map(Number) : items;
          onChange({ kind: "literal", value });
        }}
        placeholder="one value per line"
        className="text-[12px] font-mono px-2.5 py-1.5 rounded-md border border-border bg-background outline-none focus:ring-2 focus:ring-foreground/30"
      />
    );
  }
  // string / any
  return (
    <Input
      value={typeof lit === "string" ? lit : lit != null ? String(lit) : ""}
      onChange={(e) => onChange({ kind: "literal", value: e.target.value })}
      placeholder={
        field.examples?.[0] != null
          ? String(field.examples[0])
          : field.default != null
          ? String(field.default)
          : ""
      }
      className="h-8 text-[12px]"
    />
  );
}

function PathPicker({
  schema,
  value,
  onPick,
  field,
}: {
  schema: JsonSchema;
  value: string;
  onPick: (path: string) => void;
  field: OutputTemplateField;
}) {
  const tree = useMemo(() => walkSchema(schema, "$"), [schema]);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const out: SchemaPathNode[] = [];
    const want = field.type;
    const visit = (n: SchemaPathNode) => {
      if (n.depth > 0 && fieldMatchesType(n, want)) out.push(n);
      n.children?.forEach(visit);
    };
    if (tree) visit(tree);
    const f = filter.trim().toLowerCase();
    if (f) return out.filter((n) => n.path.toLowerCase().includes(f) || n.label.toLowerCase().includes(f));
    return out;
  }, [tree, field.type, filter]);

  return (
    <div className="flex flex-col gap-1">
      <Input
        value={value}
        onChange={(e) => onPick(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="$.booking.bookingRef"
        className="h-8 text-[12px] font-mono"
      />
      {open ? (
        <div className="rounded-md border bg-popover shadow-md max-h-[180px] overflow-auto">
          <div className="px-2 py-1 border-b">
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter…"
              className="h-7 text-[11px]"
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>
          {matches.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-muted-foreground italic">No compatible fields</div>
          ) : (
            matches.slice(0, 30).map((n) => (
              <button
                key={n.path}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onPick(n.path); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-[11.5px] hover:bg-muted/60 flex items-center justify-between"
              >
                <span className="font-mono truncate">{n.path}</span>
                <span className="text-muted-foreground text-[10px] ml-2">{n.type}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

// ----------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------

function seedFromDefaults(fields: OutputTemplateField[]): Record<string, PortBinding> {
  const out: Record<string, PortBinding> = {};
  for (const f of fields) {
    if (f.default !== undefined) {
      out[f.name] = { kind: "literal", value: f.default };
    }
  }
  return out;
}

function defaultLiteralFor(type: OutputTemplateField["type"]): unknown {
  switch (type) {
    case "string": return "";
    case "number": case "integer": return 0;
    case "boolean": return false;
    case "string-array": case "number-array": return [];
    case "object": case "object-array": return null;
    default: return "";
  }
}

function fieldMatchesType(node: SchemaPathNode, want: OutputTemplateField["type"]): boolean {
  const t = node.type;
  if (want === "any") return true;
  if (want === "string") return t === "string";
  if (want === "number" || want === "integer") return t === "number" || t === "integer";
  if (want === "boolean") return t === "boolean";
  if (want === "object") return t === "object";
  if (want === "string-array" || want === "number-array" || want === "object-array") return t === "array";
  return true;
}

function groupByCategory(items: OutputTemplate[]): [string, OutputTemplate[]][] {
  const groups = new Map<string, OutputTemplate[]>();
  for (const t of items) {
    const cat = t.category ?? "Other";
    const arr = groups.get(cat) ?? [];
    arr.push(t);
    groups.set(cat, arr);
  }
  return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}
