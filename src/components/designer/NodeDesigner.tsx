"use client";

import { Trash2, Wand2, Quote, Database, BookOpen, Type, Filter, CalendarDays, Hash } from "lucide-react";
import { useRuleStore } from "@/lib/store/rule-store";
import { useNodesStore } from "@/lib/store/nodes-store";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/button";
import { PathPicker } from "@/components/path-picker/PathPicker";
import { ReferenceMultiSelect } from "@/components/bindings/ReferenceMultiSelect";
import { DateBindingPicker } from "@/components/bindings/DateBindingPicker";
import { ObjectShapeEditor } from "@/components/bindings/ObjectShapeEditor";
import { DesignerHeader } from "./DesignerHeader";
import type { NodeDef, NodePort, PortBinding } from "@/lib/types";

export function NodeDesigner({ nodeId: instanceId }: { nodeId: string }) {
  const rule = useRuleStore((s) => s.rule);
  const updateInstance = useRuleStore((s) => s.updateInstance);
  const removeInstance = useRuleStore((s) => s.removeInstance);
  const setBinding = useRuleStore((s) => s.setBinding);
  const select = useRuleStore((s) => s.select);
  const nodeDefs = useNodesStore((s) => s.nodes);

  const instance = rule?.instances.find((i) => i.instanceId === instanceId);
  const def = instance ? nodeDefs.find((n) => n.id === instance.nodeId) : undefined;
  const bindings = rule?.bindings[instanceId];

  if (!rule || !instance) return null;

  const isTerminal = def?.category === "input" || def?.category === "output";

  return (
    <div className="flex flex-col h-full">
      <DesignerHeader
        title={instance.label ?? def?.name ?? instance.nodeId}
        subtitle={def ? `${def.id} · ${def.category}` : instance.nodeId}
        badge={def?.ui?.badge ?? "?"}
        accent={def?.ui?.accent}
      />

      <div className="flex-1 overflow-auto px-4 py-3 flex flex-col gap-5">
        {/* Display name */}
        <Section title="This instance">
          <FieldRow label="Label">
            <Input
              value={instance.label ?? ""}
              onChange={(e) => updateInstance(instanceId, (i) => ({ ...i, label: e.target.value || undefined }))}
              placeholder={def?.name ?? "Display label"}
            />
          </FieldRow>
        </Section>

        {/* Node-def description (read-only context) */}
        {def?.description ? (
          <div className="rounded-md border bg-muted/30 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/80 font-medium mb-1">
              About {def.name}
            </div>
            <p className="text-[12px] leading-relaxed text-foreground/80">{def.description}</p>
          </div>
        ) : null}

        {/* Inputs (path-bound) */}
        {def?.ports.inputs?.length ? (
          <Section title="Inputs" subtitle="Bind each port to a value from this rule's schema">
            {def.ports.inputs.map((port) => (
              <PortBindingRow
                key={port.name}
                port={port}
                binding={bindings?.bindings[port.name]}
                onChange={(b) => setBinding(instanceId, port.name, b)}
                inputSchema={rule.inputSchema}
              />
            ))}
          </Section>
        ) : null}

        {/* Params (literal-bound) */}
        {def?.ports.params?.length ? (
          <Section title="Parameters" subtitle="Configure how this node behaves in this rule">
            {def.ports.params.map((port) => (
              <PortBindingRow
                key={port.name}
                port={port}
                binding={bindings?.bindings[port.name]}
                onChange={(b) => setBinding(instanceId, port.name, b)}
                inputSchema={rule.inputSchema}
                paramOnly
              />
            ))}
          </Section>
        ) : null}

        {/* Outputs (read-only display) */}
        {def?.ports.outputs?.length ? (
          <Section title="Outputs">
            <div className="flex flex-col gap-1.5">
              {def.ports.outputs.map((out) => (
                <div key={out.name} className="flex items-center gap-2 text-[11.5px]">
                  <span
                    className={
                      out.branch === "pass" ? "px-1.5 h-4 rounded font-mono inline-flex items-center text-[10px] bg-emerald-50 text-emerald-900 border border-emerald-200" :
                      out.branch === "fail" ? "px-1.5 h-4 rounded font-mono inline-flex items-center text-[10px] bg-red-50 text-red-900 border border-red-200" :
                      "px-1.5 h-4 rounded font-mono inline-flex items-center text-[10px] bg-muted text-muted-foreground border border-border"
                    }
                  >
                    {out.branch ?? "default"}
                  </span>
                  <span className="font-mono text-muted-foreground">{out.name}</span>
                  {out.description ? (
                    <span className="text-muted-foreground/70">— {out.description}</span>
                  ) : null}
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        {/* Remove button */}
        <div className="pt-2 border-t">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              removeInstance(instanceId);
              select({ kind: "none" });
            }}
            disabled={isTerminal}
            title={isTerminal ? "Input/output nodes are required" : "Remove this node-instance from the rule"}
          >
            <Trash2 className="w-3.5 h-3.5" /> Remove instance
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------- helpers ----------

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground/80 font-medium">{title}</div>
        {subtitle ? <div className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</div> : null}
      </div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-[11.5px] font-medium text-foreground">{label}</label>
        {hint ? <span className="text-[10.5px] text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

type PortBindingRowProps = {
  port: NodePort;
  binding: PortBinding | undefined;
  onChange: (next: PortBinding | null) => void;
  inputSchema: import("@/lib/types").JsonSchema;
  paramOnly?: boolean;
};

function PortBindingRow({ port, binding, onChange, inputSchema, paramOnly }: PortBindingRowProps) {
  // ref-select is only useful when the port wants a list of values.
  const allowsRefSelect = port.type === "string-array" || port.type === "number-array";
  // Date picker is offered for date-typed ports.
  const allowsDate = port.type === "date";
  // count-of resolves to a number from an array path.
  const allowsCountOf = port.type === "number" || port.type === "integer";

  const baseKinds: PortBinding["kind"][] = paramOnly
    ? ["literal", "reference"]
    : ["path", "context", "literal", "reference"];
  const extras: PortBinding["kind"][] = [
    ...(allowsRefSelect ? ["ref-select" as const] : []),
    ...(allowsDate ? ["date" as const] : []),
    ...(allowsCountOf && !paramOnly ? ["count-of" as const] : []),
  ];
  const kinds: PortBinding["kind"][] = [...baseKinds.slice(0, -1), ...extras, baseKinds[baseKinds.length - 1]];

  const currentKind = binding?.kind ?? (allowsDate ? "date" : kinds[0]);

  function changeKind(kind: PortBinding["kind"]) {
    if (kind === "path") onChange({ kind: "path", path: "" });
    else if (kind === "context") onChange({ kind: "context", key: "" });
    else if (kind === "literal") onChange({ kind: "literal", value: "" });
    else if (kind === "reference") onChange({ kind: "reference", referenceId: "" });
    else if (kind === "ref-select") onChange({ kind: "ref-select", referenceId: "", valueColumn: "" });
    else if (kind === "date") onChange({ kind: "date", mode: "absolute", date: new Date().toISOString().slice(0, 10) });
    else if (kind === "count-of") onChange({ kind: "count-of", arrayPath: "" });
  }

  const KIND_LABEL: Record<PortBinding["kind"], string> = {
    path: "path",
    context: "context",
    literal: "literal",
    reference: "ref",
    "ref-select": "from ref",
    date: "date",
    "count-of": "count",
  };

  return (
    <div className="rounded-md border bg-card p-2.5 flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[12px] font-medium font-mono text-foreground truncate">{port.name}</span>
          {port.required ? (
            <span className="text-[9.5px] uppercase tracking-wider px-1 h-3.5 inline-flex items-center rounded bg-red-50 text-red-700 border border-red-200 font-medium dark:bg-red-950/30 dark:text-red-300 dark:border-red-900">
              req
            </span>
          ) : null}
          <span className="text-[10.5px] text-muted-foreground font-mono">{port.type}</span>
        </div>
      </div>
      {port.description ? (
        <p className="text-[11px] text-muted-foreground leading-snug">{port.description}</p>
      ) : null}

      {/* Kind switcher */}
      <div className="flex gap-1 flex-wrap">
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => changeKind(k)}
            className={
              currentKind === k
                ? "px-1.5 h-5 text-[10px] font-medium rounded bg-foreground text-background"
                : "px-1.5 h-5 text-[10px] font-medium rounded bg-muted text-muted-foreground hover:bg-muted/70"
            }
          >
            <span className="inline-flex items-center gap-1">
              {k === "path" ? <Wand2 className="w-2.5 h-2.5" /> : null}
              {k === "context" ? <Quote className="w-2.5 h-2.5" /> : null}
              {k === "literal" ? <Type className="w-2.5 h-2.5" /> : null}
              {k === "reference" ? <Database className="w-2.5 h-2.5" /> : null}
              {k === "ref-select" ? <Filter className="w-2.5 h-2.5" /> : null}
              {k === "date" ? <CalendarDays className="w-2.5 h-2.5" /> : null}
              {k === "count-of" ? <Hash className="w-2.5 h-2.5" /> : null}
              {KIND_LABEL[k]}
            </span>
          </button>
        ))}
        {binding ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="ml-auto px-1.5 h-5 text-[10px] font-medium rounded text-muted-foreground hover:text-foreground"
            title="Clear binding"
          >
            clear
          </button>
        ) : null}
      </div>

      {/* Value editor for the selected kind */}
      {binding ? <PortBindingValue binding={binding} port={port} onChange={onChange} inputSchema={inputSchema} /> : (
        <div className="text-[10.5px] text-muted-foreground italic">Pick a binding kind above to wire this port.</div>
      )}
    </div>
  );
}

function PortBindingValue({
  binding,
  port,
  onChange,
  inputSchema,
}: {
  binding: PortBinding;
  port: NodePort;
  onChange: (next: PortBinding) => void;
  inputSchema: import("@/lib/types").JsonSchema;
}) {
  if (binding.kind === "path") {
    return (
      <PathPicker
        schema={inputSchema}
        value={binding.path}
        onChange={(path) => onChange({ kind: "path", path })}
        hint={port.hint}
        placeholder="$.field.path"
      />
    );
  }
  if (binding.kind === "context") {
    return (
      <Input
        value={binding.key}
        onChange={(e) => onChange({ kind: "context", key: e.target.value })}
        placeholder="pax.id  or  ctx.computedAge"
      />
    );
  }
  if (binding.kind === "literal") {
    const isObjectish = port.type === "object" || port.type === "any";
    if (isObjectish) {
      return (
        <ObjectShapeEditor
          value={binding.value}
          onChange={(next) => onChange({ kind: "literal", value: next })}
          inputSchema={inputSchema}
        />
      );
    }
    if (port.type === "string-array" || port.type === "number-array") {
      const arr = Array.isArray(binding.value) ? binding.value : [];
      return (
        <Input
          value={arr.join(", ")}
          onChange={(e) => {
            const items = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
            const value = port.type === "number-array" ? items.map((s) => Number(s)) : items;
            onChange({ kind: "literal", value });
          }}
          placeholder={port.type === "number-array" ? "1, 2, 3" : "ADT, CHD, INF"}
        />
      );
    }
    if (port.type === "number" || port.type === "integer") {
      return (
        <Input
          type="number"
          value={typeof binding.value === "number" ? binding.value : ""}
          onChange={(e) => onChange({ kind: "literal", value: e.target.value === "" ? "" : Number(e.target.value) })}
        />
      );
    }
    if (port.type === "boolean") {
      return (
        <select
          className="w-full text-[12px] px-2 py-1.5 rounded border border-border bg-background"
          value={binding.value === true ? "true" : binding.value === false ? "false" : ""}
          onChange={(e) => onChange({ kind: "literal", value: e.target.value === "true" })}
        >
          <option value="">Pick…</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
    }
    return (
      <Input
        value={typeof binding.value === "string" ? binding.value : JSON.stringify(binding.value)}
        onChange={(e) => onChange({ kind: "literal", value: e.target.value })}
        placeholder="literal value"
      />
    );
  }
  if (binding.kind === "reference") {
    return (
      <ReferenceBindingPicker
        value={binding.referenceId}
        onChange={(referenceId) => onChange({ kind: "reference", referenceId })}
      />
    );
  }
  if (binding.kind === "ref-select") {
    return (
      <ReferenceMultiSelect
        value={binding}
        onChange={(next) => onChange(next)}
      />
    );
  }
  if (binding.kind === "date") {
    return <DateBindingPicker value={binding} onChange={(next) => onChange(next)} />;
  }
  if (binding.kind === "count-of") {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground/80 font-medium">
          Count of items at
        </span>
        <PathPicker
          schema={inputSchema}
          value={binding.arrayPath}
          onChange={(arrayPath) => onChange({ kind: "count-of", arrayPath })}
          placeholder="$.passengers[*]"
        />
        <span className="text-[10.5px] text-muted-foreground italic">
          Resolves to the number of items at this path. Useful for &ldquo;if there are 2+
          adults&rdquo; type rules.
        </span>
      </div>
    );
  }
  return null;
}

function ReferenceBindingPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  // Lazy reference list — read from the editor's references store if available.
  // Fallback: free text input.
  return (
    <div className="flex items-center gap-1.5">
      <BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ref-airports"
      />
    </div>
  );
}
