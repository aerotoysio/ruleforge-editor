"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { RuleNodeInstance, NodeDef, NodeBindings, PortBinding } from "@/lib/types";
import { useRuleStore } from "@/lib/store/rule-store";
import { cn } from "@/lib/utils";

type NodeViewData = {
  instance: RuleNodeInstance;
  def?: NodeDef;
  bindings?: NodeBindings;
};

export function NodeView({ data, selected, id }: NodeProps & { data: NodeViewData }) {
  const { instance, def, bindings } = data;
  const trace = useRuleStore((s) => s.trace);
  const outcome = trace?.nodeOutcomes[id];

  const category = def?.category ?? "filter";
  const isTerminal = category === "input" || category === "output";
  const showSourceHandle = category !== "output";
  const showTargetHandle = category !== "input";

  const accent = def?.ui?.accent ?? "#64748b";
  const badge = def?.ui?.badge ?? "?";
  const label = instance.label ?? def?.name ?? instance.nodeId;

  const outcomeStyle = outcome
    ? {
        pass:  "ring-2 ring-emerald-500/70 ring-offset-1 ring-offset-background",
        fail:  "ring-2 ring-red-500/70 ring-offset-1 ring-offset-background",
        skip:  "ring-2 ring-amber-400/70 ring-offset-1 ring-offset-background",
        error: "ring-2 ring-red-700/70 ring-offset-1 ring-offset-background",
      }[outcome]
    : "";

  if (isTerminal) {
    // Terminals are subtle pill chips with a coloured dot — much quieter
    // than the previous fully-coloured pills, while keeping the pill shape
    // as the visual cue that this is a start/end of the graph.
    return (
      <div
        className={cn(
          "relative flex items-center justify-center gap-2 transition-all border bg-card",
          outcomeStyle,
          selected ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : "",
        )}
        style={{
          borderRadius: 999,
          borderColor: selected ? "var(--foreground)" : "var(--border)",
          width: 140,
          height: 40,
          paddingLeft: 12,
          paddingRight: 12,
          boxShadow: selected
            ? "0 4px 12px -2px rgba(0,0,0,0.18)"
            : "0 1px 2px rgba(0,0,0,0.06)",
        }}
      >
        {showTargetHandle ? (
          <Handle
            type="target"
            position={Position.Left}
            style={{ background: "var(--background)", width: 10, height: 10, border: `2px solid ${accent}` }}
          />
        ) : null}
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: accent }}
          aria-hidden
        />
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{badge}</span>
        <span className="text-[13px] font-medium text-foreground truncate">{label}</span>
        {showSourceHandle ? (
          <Handle
            type="source"
            position={Position.Right}
            style={{ background: "var(--background)", width: 10, height: 10, border: `2px solid ${accent}` }}
          />
        ) : null}
      </div>
    );
  }

  const summary = describeBindings(bindings, def);

  return (
    <div
      className={cn(
        "relative min-w-[200px] max-w-[260px] rounded-md overflow-hidden bg-card transition-all",
        selected
          ? "ring-2 ring-foreground/80"
          : "border border-border hover:border-foreground/30",
        outcomeStyle,
      )}
      style={{
        boxShadow: selected
          ? "0 8px 16px -6px rgba(0,0,0,0.2)"
          : "0 1px 2px rgba(0,0,0,0.05)",
      }}
    >
      {/* Subtle 2px left accent stripe instead of a full coloured header */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: accent }}
      />

      {showTargetHandle ? (
        <Handle
          type="target"
          position={Position.Left}
          style={{ background: "var(--muted-foreground)", width: 8, height: 8, border: "2px solid var(--background)" }}
        />
      ) : null}

      <div className="px-3 py-2 pl-3.5">
        <div className="flex items-center gap-1.5 text-[9.5px] font-mono text-muted-foreground tracking-[0.08em] mb-0.5">
          <span className="font-semibold uppercase" style={{ color: accent }}>{badge}</span>
          <span className="opacity-70">{def?.category?.toUpperCase() ?? ""}</span>
        </div>
        <div className="text-[13px] font-medium leading-tight text-foreground">{label}</div>
        {summary ? (
          <div className="mt-1 font-mono text-[10.5px] leading-snug truncate text-muted-foreground" title={summary}>
            {summary}
          </div>
        ) : null}
      </div>

      {showSourceHandle ? (
        <Handle
          type="source"
          position={Position.Right}
          style={{ background: "var(--muted-foreground)", width: 8, height: 8, border: "2px solid var(--background)" }}
        />
      ) : null}
    </div>
  );
}

function describeBindings(bindings: NodeBindings | undefined, def: NodeDef | undefined): string | null {
  if (!bindings || !def) return null;
  const parts: string[] = [];
  for (const port of [...(def.ports.inputs ?? []), ...(def.ports.params ?? [])]) {
    const b = bindings.bindings[port.name];
    if (!b) continue;
    parts.push(`${port.name}: ${formatPortBinding(b)}`);
    if (parts.length >= 2) break;
  }
  return parts.length ? parts.join(" · ") : null;
}

function formatPortBinding(b: PortBinding): string {
  switch (b.kind) {
    case "path":      return b.path;
    case "literal":   return typeof b.value === "string" ? `"${b.value}"` : JSON.stringify(b.value);
    case "reference": return `→ ${b.referenceId}`;
    case "context":   return `$${b.key}`;
  }
}
