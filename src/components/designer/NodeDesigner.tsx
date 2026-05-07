"use client";

import { useState } from "react";
import { Trash2, Wand2, Quote, Database, Type, Filter, CalendarDays, Hash, Pencil } from "lucide-react";
import { useRuleStore } from "@/lib/store/rule-store";
import { useNodesStore } from "@/lib/store/nodes-store";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/button";
import { ObjectShapeEditor } from "@/components/bindings/ObjectShapeEditor";
import { BindingPickerDialog } from "@/components/bindings/BindingPickerDialog";
import { DesignerHeader } from "./DesignerHeader";
import { cn } from "@/lib/utils";
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

function PortBindingRow({ port, binding, onChange, inputSchema }: PortBindingRowProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  // For boolean ports we keep an inline yes/no toggle — opening a dialog
  // for that would be silly. Everything else routes through the dialog.
  const inlineBoolean = port.type === "boolean";

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

      {inlineBoolean ? (
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => onChange({ kind: "literal", value: true })}
            className={cn(
              "h-8 px-3 text-[12px] font-medium rounded-md border transition-colors",
              binding?.kind === "literal" && binding.value === true
                ? "bg-foreground text-background border-foreground"
                : "bg-card text-foreground border-border hover:border-foreground/30",
            )}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => onChange({ kind: "literal", value: false })}
            className={cn(
              "h-8 px-3 text-[12px] font-medium rounded-md border transition-colors",
              binding?.kind === "literal" && binding.value === false
                ? "bg-foreground text-background border-foreground"
                : "bg-card text-foreground border-border hover:border-foreground/30",
            )}
          >
            No
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className={cn(
            "w-full text-left rounded-md border px-2.5 py-2 transition-colors flex items-start gap-2",
            binding
              ? "bg-card border-border hover:border-foreground/30"
              : "bg-muted/30 border-dashed border-border hover:border-foreground/30",
          )}
        >
          <BindingValuePreview binding={binding} />
          <Pencil className="w-3 h-3 text-muted-foreground/60 shrink-0 mt-0.5" />
        </button>
      )}

      {/* Object-shape literals get a structured form below the preview tile. */}
      {(port.type === "object" || port.type === "any") && binding?.kind === "literal" ? (
        <ObjectShapeEditor
          value={binding.value}
          onChange={(v) => onChange({ kind: "literal", value: v })}
          inputSchema={inputSchema}
        />
      ) : null}

      <BindingPickerDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        port={port}
        inputSchema={inputSchema}
        initial={binding}
        onSave={(b) => onChange(b)}
        onClear={() => onChange(null)}
      />
    </div>
  );
}

function BindingValuePreview({ binding }: { binding: PortBinding | undefined }) {
  if (!binding) {
    return (
      <span className="text-[12px] text-muted-foreground italic flex-1">
        Click to bind…
      </span>
    );
  }
  const kindLabel = labelForKind(binding.kind);
  const detail = describeForPreview(binding);
  const Icon = iconForKind(binding.kind);
  return (
    <div className="flex-1 flex flex-col gap-0.5 min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium flex items-center gap-1">
        <Icon className="w-2.5 h-2.5" />
        {kindLabel}
      </div>
      <div className="text-[12px] font-medium text-foreground truncate">{detail}</div>
    </div>
  );
}

function labelForKind(k: PortBinding["kind"]): string {
  switch (k) {
    case "path": return "From request";
    case "context": return "From context";
    case "literal": return "Literal";
    case "reference": return "Reference table";
    case "ref-select": return "From reference";
    case "date": return "Date";
    case "count-of": return "Count of";
  }
}

function iconForKind(k: PortBinding["kind"]) {
  if (k === "path") return Wand2;
  if (k === "context") return Quote;
  if (k === "literal") return Type;
  if (k === "reference") return Database;
  if (k === "ref-select") return Filter;
  if (k === "date") return CalendarDays;
  return Hash;
}

function describeForPreview(b: PortBinding): string {
  if (b.kind === "path") return b.path || "(no path picked)";
  if (b.kind === "context") return `$${b.key || "..."}`;
  if (b.kind === "literal") {
    if (Array.isArray(b.value)) return `${b.value.length} value${b.value.length === 1 ? "" : "s"}: ${b.value.slice(0, 4).join(", ")}${b.value.length > 4 ? "…" : ""}`;
    if (typeof b.value === "string") return b.value || "(empty)";
    if (typeof b.value === "object" && b.value !== null) {
      const keys = Object.keys(b.value);
      return keys.length ? `{ ${keys.slice(0, 3).join(", ")}${keys.length > 3 ? ", …" : ""} }` : "(empty object)";
    }
    return String(b.value);
  }
  if (b.kind === "ref-select") {
    const n = b.whereValues?.length ?? 0;
    return `${n} value${n === 1 ? "" : "s"} from ${b.referenceId || "(no reference)"}`;
  }
  if (b.kind === "reference") return b.referenceId || "(no reference)";
  if (b.kind === "date") {
    if (b.mode === "absolute") return b.date ?? "(pick a date)";
    if (b.mode === "relative-window") return `within the ${b.direction} ${b.amount} ${b.unit}`;
    if (b.mode === "day-of-week") return `weekday in ${(b.values ?? []).join(", ")}`;
    if (b.mode === "month-of-year") return `month in ${(b.values ?? []).join(", ")}`;
    if (b.mode === "is-weekend") return b.values?.[0] === 1 ? "is a weekend" : "is a weekday";
    return b.mode;
  }
  if (b.kind === "count-of") return `count of ${b.arrayPath}`;
  return "";
}

