"use client";

import { useRuleStore } from "@/lib/store/rule-store";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { NodeDesigner } from "./NodeDesigner";
import { EdgeDesigner } from "./EdgeDesigner";
import { RuleMetadataDesigner } from "./RuleMetadataDesigner";

type Mode = "selection" | "rule";

type Props = {
  mode: Mode | null;
  onClose: () => void;
};

export function SettingsSheet({ mode, onClose }: Props) {
  const selection = useRuleStore((s) => s.selection);
  const rule = useRuleStore((s) => s.rule);

  const open = mode === "rule" || (mode === "selection" && selection.kind !== "none");

  if (!rule) return null;

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent
        side="right"
        className="w-[420px] sm:max-w-[420px] p-0 gap-0 flex flex-col"
      >
        {/* Visually-hidden title for screen readers; the DesignerHeader inside provides the visible heading */}
        <SheetTitle className="sr-only">Settings</SheetTitle>
        <SheetDescription className="sr-only">
          Edit the selected node, edge, or rule metadata.
        </SheetDescription>

        <div className="flex-1 flex flex-col overflow-hidden">
          {mode === "rule" ? (
            <RuleMetadataDesigner />
          ) : selection.kind === "node" ? (
            <NodeDesigner key={selection.id} nodeId={selection.id} />
          ) : selection.kind === "edge" ? (
            <EdgeDesigner key={selection.id} edgeId={selection.id} />
          ) : null}
        </div>

        <div
          className="shrink-0 flex items-center justify-between"
          style={{
            padding: "10px 18px",
            fontSize: 11,
            color: "var(--text-muted)",
            background: "var(--panel-2)",
            borderTop: "1px solid var(--border)",
          }}
        >
          <span>
            Edits apply immediately. Use the toolbar{" "}
            <strong style={{ color: "var(--text)" }}>Save</strong> to persist to disk.
          </span>
        </div>
      </SheetContent>
    </Sheet>
  );
}
