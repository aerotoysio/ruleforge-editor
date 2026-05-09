"use client";

import { useEffect, useRef, useState } from "react";
import { Handle, Position, useStoreApi, type NodeProps } from "@xyflow/react";
import { Settings2, Trash2 } from "lucide-react";
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
  const updateInstance = useRuleStore((s) => s.updateInstance);
  const requestEdit = useRuleStore((s) => s.requestEdit);
  const removeInstance = useRuleStore((s) => s.removeInstance);
  const outcome = trace?.nodeOutcomes[id];

  const category = def?.category ?? "filter";
  const isTerminal = category === "input" || category === "output";
  const showSourceHandle = category !== "output";
  const showTargetHandle = category !== "input";
  // Categories that get the configure dialog (everything except terminals).
  // Keep this in sync with UNIFIED_DIALOG_CATEGORIES in RuleEditorClient.
  const isConfigurable = !isTerminal;

  const accent = def?.ui?.accent ?? "#64748b";
  const badge = def?.ui?.badge ?? "?";
  const label = instance.label ?? def?.name ?? instance.nodeId;
  // Per-instance description takes precedence over the def's generic description.
  // Only show it when the user has authored one — the def description is shown
  // in the dialog header and palette, not on the canvas card (would be noisy).
  const userDescription = instance.description?.trim();

  // When the node-def loads asynchronously and we suddenly grow extra handles
  // (per-branch pass/fail), React Flow needs to be told to re-scan the DOM —
  // otherwise edges with sourceHandle="pass" can't find their target handle
  // and silently disappear. We dispatch the store action SYNCHRONOUSLY (the
  // upstream `useUpdateNodeInternals` hook wraps in requestAnimationFrame
  // and races with re-renders, leaving handleBounds populated for the OLD
  // handle layout).
  const flowStoreApi = useStoreApi();
  const handleCountKey = `${def?.id ?? "no-def"}:${(def?.ports.outputs ?? []).length}`;
  useEffect(() => {
    const state = flowStoreApi.getState();
    if (!state.domNode) return;
    const el = state.domNode.querySelector<HTMLDivElement>(`.react-flow__node[data-id="${id}"]`);
    if (!el) return;
    state.updateNodeInternals(
      new Map([[id, { id, nodeElement: el, force: true }]]),
    );
  }, [id, handleCountKey, flowStoreApi]);

  // Inline label edit — double-click the label to rename without opening the sheet.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setDraft(label);
    setEditing(true);
  }

  function commitEdit() {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== label) {
      updateInstance(instance.instanceId, (i) => ({ ...i, label: next }));
    }
  }

  function cancelEdit() {
    setEditing(false);
    setDraft(label);
  }

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

  // Stop the click from also triggering React Flow's node-select handler when
  // the user clicks the cog/trash icons — otherwise they'd both open the
  // dialog AND deselect-then-reselect.
  function onConfigureClick(e: React.MouseEvent) {
    e.stopPropagation();
    requestEdit(id);
  }
  function onDeleteClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Delete "${label}" from this rule?`)) return;
    removeInstance(id);
  }
  // Double-click on the body (not the label, not the input) opens the dialog.
  // Quick way for power users to edit without aiming at the cog.
  function onBodyDoubleClick(e: React.MouseEvent) {
    if (editing) return;
    e.stopPropagation();
    if (isConfigurable) requestEdit(id);
  }

  return (
    <div
      className={cn(
        "group/node relative min-w-[220px] max-w-[280px] rounded-md overflow-hidden bg-card transition-all",
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
      onDoubleClick={onBodyDoubleClick}
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

      {/* Hover toolbar — Configure / Delete icons. Hidden until hover/select
          so the resting node card stays clean. `nodrag nopan` so React Flow
          doesn't start a drag when the user reaches for an icon. */}
      <div
        className={cn(
          "nodrag nopan absolute top-1.5 right-1.5 flex items-center gap-0.5 transition-opacity",
          selected
            ? "opacity-100"
            : "opacity-0 group-hover/node:opacity-100 focus-within:opacity-100",
        )}
      >
        {isConfigurable ? (
          <button
            type="button"
            onClick={onConfigureClick}
            className="w-6 h-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            title="Configure (or double-click the card)"
            aria-label="Configure node"
          >
            <Settings2 className="w-3.5 h-3.5" strokeWidth={1.8} />
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDeleteClick}
          className="w-6 h-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Delete"
          aria-label="Delete node"
        >
          <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
        </button>
      </div>

      <div className="px-3 py-2.5 pl-3.5 pr-14">
        <div className="flex items-center gap-1.5 text-[9.5px] font-mono text-muted-foreground tracking-[0.08em] mb-0.5">
          <span className="font-semibold uppercase" style={{ color: accent }}>{badge}</span>
          <span className="opacity-70">{def?.category?.toUpperCase() ?? ""}</span>
        </div>
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
              if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
            }}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            className="nodrag text-[13.5px] font-medium leading-tight text-foreground bg-background border border-foreground/40 rounded px-1 -mx-1 -my-0.5 w-[calc(100%+0.5rem)] focus:outline-none focus:ring-2 focus:ring-foreground/30"
          />
        ) : (
          <div
            className="text-[13.5px] font-medium leading-snug text-foreground cursor-text break-words"
            title="Double-click to rename"
            onDoubleClick={(e) => { e.stopPropagation(); startEdit(e); }}
          >
            {label}
          </div>
        )}
        {/* Description (user-authored intent) takes the prominent slot below
            the label. Falls back to a one-line bindings summary so blank
            nodes still hint at what they're wired to. */}
        {userDescription ? (
          <div
            className="mt-1 text-[11.5px] leading-snug text-muted-foreground italic line-clamp-2"
            title={userDescription}
          >
            {userDescription}
          </div>
        ) : summary ? (
          <div className="mt-1 font-mono text-[10.5px] leading-snug truncate text-muted-foreground" title={summary}>
            {summary}
          </div>
        ) : null}
      </div>

      {showSourceHandle ? (
        (() => {
          // If the node-def declares multiple branched outputs (e.g. filter
          // → pass / fail), render one handle per output, vertically stacked
          // and labelled with the branch tone. Dragging from the green
          // handle creates a "pass" edge; from the red one, a "fail" edge.
          const outputs = (def?.ports.outputs ?? []).filter((o) => o.branch && o.branch !== "default");
          if (outputs.length >= 2) {
            return (
              <>
                {outputs.map((out, i) => {
                  const colour =
                    out.branch === "pass" ? "var(--color-pass)"
                    : out.branch === "fail" ? "var(--color-fail)"
                    : "var(--color-default)";
                  // Vertical positions: 30%, 70% for two handles; evenly spaced for more.
                  const top = `${((i + 1) * 100) / (outputs.length + 1)}%`;
                  return (
                    <div key={out.name}>
                      <Handle
                        id={out.name}
                        type="source"
                        position={Position.Right}
                        style={{
                          top,
                          background: colour,
                          width: 10,
                          height: 10,
                          border: "2px solid var(--background)",
                        }}
                      />
                      <span
                        className="absolute right-3 text-[8.5px] font-semibold font-mono tracking-wider uppercase pointer-events-none"
                        style={{ top, transform: "translateY(-50%)", color: colour }}
                      >
                        {out.name}
                      </span>
                    </div>
                  );
                })}
              </>
            );
          }
          // Single default output — one centred handle, unchanged
          return (
            <Handle
              type="source"
              position={Position.Right}
              style={{ background: "var(--muted-foreground)", width: 8, height: 8, border: "2px solid var(--background)" }}
            />
          );
        })()
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
    case "path":           return b.path;
    case "literal":        return typeof b.value === "string" ? `"${b.value}"` : JSON.stringify(b.value);
    case "reference":      return `→ ${b.referenceId}`;
    case "context":        return `$${b.key}`;
    case "ref-select":     return `${b.referenceId} · ${b.whereValues?.length ?? 0} picks`;
    case "date":           return b.mode === "absolute" ? (b.date ?? "date") : `date:${b.mode}`;
    case "count-of":       return `count(${b.arrayPath})`;
    case "markets-select": return `${b.referenceId} (+${b.include.length}/-${b.exclude.length})`;
    case "template-fill":  return b.templateId ? `${b.templateId} · ${Object.keys(b.fields).length} fields` : "(no template)";
  }
}
