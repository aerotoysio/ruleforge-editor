"use client";

import { useEffect, useRef, useState } from "react";
import { Handle, Position, useStoreApi, type NodeProps } from "@xyflow/react";
import { Settings2, Trash2 } from "lucide-react";
import type { RuleNodeInstance, NodeDef, NodeBindings, PortBinding } from "@/lib/types";
import { useRuleStore } from "@/lib/store/rule-store";
import { useTemplatesStore } from "@/lib/store/templates-store";
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

  // Templates store powers the canvas-card summary for template-fill bindings —
  // we want to show "Bag fee line · 3 fields" rather than the opaque
  // "tmpl-bag-fee-line · 3 fields". CRITICAL: this hook MUST live before the
  // `isTerminal` early return below, or React sees a different hook count
  // for terminal vs non-terminal nodes and tears down the subtree.
  const templates = useTemplatesStore((s) => s.templates);
  const summary = describeBindings(bindings, def, templates);

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
    // Terminals are pill chips with a coloured badge dot — the design's
    // node header miniaturised into a single horizontal pill.
    return (
      <div
        className={cn("relative flex items-center justify-center gap-2 transition-all", outcomeStyle)}
        style={{
          background: "var(--panel)",
          border: `1px solid ${selected ? "var(--accent)" : "var(--border-strong)"}`,
          borderRadius: 999,
          width: 140,
          height: 38,
          padding: "0 14px",
          boxShadow: selected
            ? "0 0 0 3px var(--accent-soft), var(--shadow-md)"
            : "var(--shadow-sm)",
          userSelect: "none",
          cursor: "grab",
        }}
      >
        {showTargetHandle ? (
          <Handle
            type="target"
            position={Position.Left}
            style={{
              background: "var(--panel)",
              width: 10,
              height: 10,
              border: `2px solid ${selected ? "var(--accent)" : "var(--border-strong)"}`,
              left: -6,
            }}
          />
        ) : null}
        <span
          className="inline-flex items-center justify-center mono"
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            background: hexToRgba(accent, 0.18),
            color: accent,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.04em",
            flexShrink: 0,
          }}
        >
          {badge}
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
        {showSourceHandle ? (
          <Handle
            type="source"
            position={Position.Right}
            style={{
              background: "var(--panel)",
              width: 10,
              height: 10,
              border: `2px solid ${selected ? "var(--accent)" : "var(--border-strong)"}`,
              right: -6,
            }}
          />
        ) : null}
      </div>
    );
  }

  // (`templates` + `summary` were hoisted to the top of the component above
  // the isTerminal early return so the hook count stays constant.)

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
      className={cn("group/node relative overflow-hidden", outcomeStyle)}
      style={{
        width: 220,
        background: "var(--panel)",
        border: `1px solid ${selected ? "var(--accent)" : "var(--border-strong)"}`,
        borderRadius: 10,
        boxShadow: selected
          ? "0 0 0 3px var(--accent-soft), var(--shadow-md)"
          : "var(--shadow-sm)",
        fontSize: 12,
        userSelect: "none",
        cursor: "grab",
        transition: "border-color 0.12s, box-shadow 0.12s",
      }}
      onDoubleClick={onBodyDoubleClick}
    >
      {showTargetHandle ? (
        <Handle
          type="target"
          position={Position.Left}
          style={{
            background: "var(--panel)",
            width: 10,
            height: 10,
            border: `2px solid ${selected ? "var(--accent)" : "var(--border-strong)"}`,
            left: -6,
          }}
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

      {/* Header (`.nh`) — small badge + category label on a panel-2 strip */}
      <div
        className="flex items-center gap-2"
        style={{
          padding: "7px 10px",
          background: "var(--panel-2)",
          borderBottom: "1px solid var(--border)",
          borderRadius: "9px 9px 0 0",
        }}
      >
        <span
          className="inline-flex items-center justify-center mono"
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            background: hexToRgba(accent, 0.18),
            color: accent,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: "0.04em",
            flexShrink: 0,
          }}
        >
          {badge}
        </span>
        <span
          className="mono"
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "var(--text-muted)",
            fontWeight: 500,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {def?.category ?? ""}
        </span>
      </div>

      {/* Body (`.nb`) — title + (description OR binding summary) */}
      <div style={{ padding: 10, paddingRight: 38 }}>
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
            className="nodrag"
            style={{
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: "-0.01em",
              color: "var(--text)",
              background: "var(--bg)",
              border: "1px solid var(--accent)",
              borderRadius: 4,
              padding: "1px 4px",
              width: "100%",
              outline: "none",
              boxShadow: "0 0 0 3px var(--accent-soft)",
            }}
          />
        ) : (
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: "-0.01em",
              color: "var(--text)",
              cursor: "text",
              lineHeight: 1.3,
              wordBreak: "break-word",
              marginBottom: userDescription || summary ? 4 : 0,
            }}
            title="Double-click to rename"
            onDoubleClick={(e) => { e.stopPropagation(); startEdit(e); }}
          >
            {label}
          </div>
        )}
        {userDescription ? (
          <div
            className="line-clamp-2"
            style={{
              fontSize: 11.5,
              color: "var(--text-muted)",
              fontStyle: "italic",
              lineHeight: 1.4,
            }}
            title={userDescription}
          >
            {userDescription}
          </div>
        ) : summary ? (
          <div
            className="mono truncate"
            style={{
              fontSize: 10.5,
              color: "var(--text-muted)",
              lineHeight: 1.4,
            }}
            title={summary}
          >
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
                          background: "var(--panel)",
                          width: 10,
                          height: 10,
                          border: `2px solid ${colour}`,
                          right: -6,
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
          // Single default output — one centred handle
          return (
            <Handle
              type="source"
              position={Position.Right}
              style={{
                background: "var(--panel)",
                width: 10,
                height: 10,
                border: `2px solid ${selected ? "var(--accent)" : "var(--border-strong)"}`,
                right: -6,
              }}
            />
          );
        })()
      ) : null}
    </div>
  );
}

function describeBindings(
  bindings: NodeBindings | undefined,
  def: NodeDef | undefined,
  templates: { id: string; name: string }[] = [],
): string | null {
  if (!bindings || !def) return null;
  const parts: string[] = [];
  for (const port of [...(def.ports.inputs ?? []), ...(def.ports.params ?? [])]) {
    const b = bindings.bindings[port.name];
    if (!b) continue;
    parts.push(`${port.name}: ${formatPortBinding(b, templates)}`);
    if (parts.length >= 2) break;
  }
  return parts.length ? parts.join(" · ") : null;
}

function formatPortBinding(b: PortBinding, templates: { id: string; name: string }[] = []): string {
  switch (b.kind) {
    case "path":           return b.path;
    case "literal":        return typeof b.value === "string" ? `"${b.value}"` : JSON.stringify(b.value);
    case "reference":      return `→ ${b.referenceId}`;
    case "context":        return `$${b.key}`;
    case "ref-select":     return `${b.referenceId} · ${b.whereValues?.length ?? 0} picks`;
    case "date":           return b.mode === "absolute" ? (b.date ?? "date") : `date:${b.mode}`;
    case "count-of":       return `count(${b.arrayPath})`;
    case "markets-select": return `${b.referenceId} (+${b.include.length}/-${b.exclude.length})`;
    case "template-fill": {
      if (!b.templateId) return "(no template)";
      const name = templates.find((t) => t.id === b.templateId)?.name ?? b.templateId;
      const filled = Object.keys(b.fields).length;
      return `${name} · ${filled} ${filled === 1 ? "field" : "fields"}`;
    }
  }
}

/**
 * Soften a CSS color into an `rgba` with the given alpha — used to tint the
 * node header's badge background while keeping its foreground full-strength.
 * Accepts hex (#abc / #aabbcc) and falls back to a generic translucent grey
 * for non-hex inputs (CSS vars, oklch() strings) so we don't break rendering.
 */
function hexToRgba(color: string, alpha: number): string {
  if (!color?.startsWith("#")) return `rgba(120, 120, 120, ${alpha})`;
  let hex = color.slice(1);
  if (hex.length === 3) {
    hex = hex.split("").map((c) => c + c).join("");
  }
  if (hex.length !== 6) return `rgba(120, 120, 120, ${alpha})`;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
