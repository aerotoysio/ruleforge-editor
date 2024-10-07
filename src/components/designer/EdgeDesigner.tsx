"use client";

import { Trash2 } from "lucide-react";
import { useRuleStore } from "@/lib/store/rule-store";
import { Button } from "@/components/ui/button";
import { DesignerHeader } from "./DesignerHeader";
import type { EdgeBranch } from "@/lib/types";

const BRANCHES: { value: EdgeBranch; label: string; tone: string }[] = [
  { value: "pass",    label: "Pass",    tone: "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900" },
  { value: "fail",    label: "Fail",    tone: "bg-red-50 text-red-900 border-red-200 dark:bg-red-950/30 dark:text-red-200 dark:border-red-900" },
  { value: "default", label: "Default", tone: "bg-muted text-muted-foreground border-border" },
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
      <div className="flex-1 overflow-auto px-4 py-3 flex flex-col gap-5">
        <Section title="Routing">
          <div className="rounded-md border bg-card p-3 flex flex-col gap-1.5">
            <div className="flex items-center gap-2 text-[12px]">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 w-12">From</span>
              <span className="font-medium text-foreground truncate">{sourceLabel}</span>
              <span className="font-mono text-[10.5px] text-muted-foreground/70 ml-auto">{edge.source}</span>
            </div>
            <div className="flex items-center gap-2 text-[12px]">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 w-12">To</span>
              <span className="font-medium text-foreground truncate">{targetLabel}</span>
              <span className="font-mono text-[10.5px] text-muted-foreground/70 ml-auto">{edge.target}</span>
            </div>
          </div>
        </Section>

        <Section title="Branch" subtitle="The outcome that follows this edge from the source node">
          <div className="grid grid-cols-3 gap-1.5">
            {BRANCHES.map((b) => {
              const active = (edge.branch ?? "default") === b.value;
              return (
                <button
                  key={b.value}
                  type="button"
                  onClick={() => updateEdge(edge.id, (cur) => ({ ...cur, branch: b.value }))}
                  className={
                    "px-2 py-1.5 text-[12px] font-medium rounded-md border transition-all " +
                    (active
                      ? `${b.tone} ring-2 ring-foreground/20`
                      : "bg-card text-muted-foreground border-border hover:border-foreground/30")
                  }
                >
                  {b.label}
                </button>
              );
            })}
          </div>
        </Section>

        <div className="pt-2 border-t">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              removeEdge(edge.id);
              select({ kind: "none" });
            }}
          >
            <Trash2 className="w-3.5 h-3.5" /> Remove edge
          </Button>
        </div>
      </div>
    </div>
  );
}

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
