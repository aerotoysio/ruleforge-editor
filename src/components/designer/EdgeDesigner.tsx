"use client";

import { Trash2 } from "lucide-react";
import { useRuleStore } from "@/lib/store/rule-store";
import { DesignerHeader } from "./DesignerHeader";
import type { EdgeBranch } from "@/lib/types";
import { cn } from "@/lib/utils";

type BranchTone = {
  value: EdgeBranch;
  label: string;
  bg: string;
  fg: string;
};

// Branch button tones — pass/fail/default. Active state is driven by the
// `.option-card.on` class (accent border + accent-soft bg) so branding stays
// consistent with the rest of the popup vocabulary; the inline bg/fg here
// is only used for the LITTLE tint dot on each button.
const BRANCHES: BranchTone[] = [
  { value: "pass",    label: "Pass",    bg: "var(--success-soft)", fg: "var(--success)" },
  { value: "fail",    label: "Fail",    bg: "var(--danger-soft)",  fg: "var(--danger)" },
  { value: "default", label: "Default", bg: "var(--panel-2)",      fg: "var(--text-muted)" },
];

export function EdgeDesigner({ edgeId }: { edgeId: string }) {
  const rule = useRuleStore((s) => s.rule);
  const updateEdge = useRuleStore((s) => s.updateEdge);
  const removeEdge = useRuleStore((s) => s.removeEdge);
  const select = useRuleStore((s) => s.select);
  const edge = rule?.edges.find((e) => e.id === edgeId);
  if (!edge) return null;

  const sourceLabel = rule?.instances.find((i) => i.instanceId === edge.source)?.label ?? edge.source;
  const targetLabel = rule?.instances.find((i) => i.instanceId === edge.target)?.label ?? edge.target;

  return (
    <div className="flex flex-col h-full">
      <DesignerHeader title="Edge" subtitle={edge.id} badge="EDG" accent="#5b6470" />
      <div className="popup-body" style={{ flex: 1 }}>
        <section className="field-group">
          <span className="field-label">Routing</span>
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 7,
              background: "var(--panel-2)",
              padding: 12,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "40px 1fr auto", gap: 10, alignItems: "center" }}>
              <span className="field-label" style={{ letterSpacing: "0.06em" }}>From</span>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text)" }} className="truncate">
                {sourceLabel}
              </span>
              <span className="mono" style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
                {edge.source}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "40px 1fr auto", gap: 10, alignItems: "center" }}>
              <span className="field-label" style={{ letterSpacing: "0.06em" }}>To</span>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text)" }} className="truncate">
                {targetLabel}
              </span>
              <span className="mono" style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
                {edge.target}
              </span>
            </div>
          </div>
        </section>

        <section className="field-group">
          <span className="field-label">Branch</span>
          <p className="field-hint">The outcome that follows this edge from the source node.</p>
          <div className="grid grid-cols-3 gap-2">
            {BRANCHES.map((b) => {
              const active = (edge.branch ?? "default") === b.value;
              return (
                <button
                  key={b.value}
                  type="button"
                  onClick={() => updateEdge(edge.id, (cur) => ({ ...cur, branch: b.value }))}
                  className={cn("option-card", active && "on")}
                  style={{ alignItems: "center", flexDirection: "row", gap: 8 }}
                >
                  <span
                    className="status-badge"
                    style={{ background: b.bg, color: b.fg, borderColor: "transparent" }}
                  >
                    <span className="dot" style={{ background: b.fg }} />
                    {b.label}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <button
            type="button"
            className="btn ghost sm"
            style={{ color: "var(--danger)" }}
            onClick={() => {
              removeEdge(edge.id);
              select({ kind: "none" });
            }}
          >
            <Trash2 className="w-3.5 h-3.5" /> Remove edge
          </button>
        </div>
      </div>
    </div>
  );
}
