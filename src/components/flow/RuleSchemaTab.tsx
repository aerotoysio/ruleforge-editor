"use client";

import { useState } from "react";
import { useRuleStore } from "@/lib/store/rule-store";
import { SchemaEditor } from "@/components/schema-editor/SchemaEditor";
import type { JsonSchema } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ArrowDownToLine, ArrowUpFromLine, Box } from "lucide-react";

type Kind = "input" | "output" | "context";

const TABS: { kind: Kind; label: string; description: string; icon: typeof ArrowDownToLine }[] = [
  { kind: "input",   label: "Input",   description: "Request body sent to this rule's endpoint.",          icon: ArrowDownToLine },
  { kind: "output",  label: "Output",  description: "Response shape returned to callers.",                  icon: ArrowUpFromLine },
  { kind: "context", label: "Context", description: "Per-evaluation values nodes write to and read from.",  icon: Box },
];

export function RuleSchemaTab() {
  const rule = useRuleStore((s) => s.rule);
  const patch = useRuleStore((s) => s.patchRule);
  const [active, setActive] = useState<Kind>("input");
  if (!rule) return null;

  const value: JsonSchema =
    active === "input"  ? rule.inputSchema
    : active === "output" ? rule.outputSchema
    : (rule.contextSchema ?? { type: "object", properties: {} });

  function onChange(next: JsonSchema) {
    if (active === "input")  patch({ inputSchema: next });
    if (active === "output") patch({ outputSchema: next });
    if (active === "context") patch({ contextSchema: next });
  }

  return (
    <div className="flex-1 flex overflow-hidden bg-muted/30">
      {/* Sub-nav: input / output / context */}
      <aside className="w-56 shrink-0 border-r bg-background flex flex-col">
        <div className="px-4 py-3 border-b">
          <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground/80 font-medium">Schemas</div>
        </div>
        <nav className="flex flex-col gap-0.5 p-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = t.kind === active;
            return (
              <button
                key={t.kind}
                onClick={() => setActive(t.kind)}
                className={cn(
                  "text-left flex items-start gap-2.5 px-2.5 py-2 rounded-md transition-colors",
                  isActive
                    ? "bg-foreground text-background"
                    : "text-foreground hover:bg-muted/60",
                )}
              >
                <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" strokeWidth={isActive ? 2.2 : 1.8} />
                <div className="flex flex-col leading-tight">
                  <span className="text-[12.5px] font-medium">{t.label}</span>
                  <span className={cn("text-[10.5px] leading-snug mt-0.5", isActive ? "opacity-80" : "text-muted-foreground")}>
                    {t.description}
                  </span>
                </div>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1 overflow-auto px-6 py-5">
        <div className="max-w-3xl mx-auto">
          <div className="rounded-lg border bg-card shadow-sm p-5">
            <SchemaEditor schema={value} onChange={onChange} />
          </div>
        </div>
      </div>
    </div>
  );
}
