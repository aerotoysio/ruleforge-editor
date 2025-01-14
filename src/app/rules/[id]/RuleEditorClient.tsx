"use client";

import { useEffect, useState } from "react";
import { Workflow, Braces, FlaskConical } from "lucide-react";
import type { Rule, RuleTest } from "@/lib/types";
import { useRuleStore } from "@/lib/store/rule-store";
import { useReferencesStore } from "@/lib/store/references-store";
import { useNodesStore } from "@/lib/store/nodes-store";
import { Canvas } from "@/components/flow/Canvas";
import { Toolbar } from "@/components/flow/Toolbar";
import { TestPanel } from "@/components/flow/TestPanel";
import { RightPalette } from "@/components/flow/RightPalette";
import { SettingsSheet } from "@/components/designer/SettingsSheet";
import { AiDraftSheet } from "@/components/flow/AiDraftSheet";
import { RuleSchemaTab } from "@/components/flow/RuleSchemaTab";
import { RuleTestsTab } from "@/components/flow/RuleTestsTab";
import { NodeConfigDialog } from "@/components/bindings/NodeConfigDialog";
import { cn } from "@/lib/utils";

// Categories that get the new unified single-popup config experience.
// Other categories keep the per-port side sheet for now — we'll expand
// as we validate the pattern.
const UNIFIED_DIALOG_CATEGORIES = new Set(["filter"]);

type Tab = "graph" | "schema" | "tests";

const TABS: { id: Tab; label: string; icon: typeof Workflow; description: string }[] = [
  { id: "graph",  label: "Graph",  icon: Workflow,     description: "Drag nodes onto the canvas and bind their ports" },
  { id: "schema", label: "Schema", icon: Braces,       description: "Define the input, output, and context shapes" },
  { id: "tests",  label: "Tests",  icon: FlaskConical, description: "Canonical scenarios to run this rule against" },
];

export function RuleEditorClient({ initial }: { initial: Rule }) {
  const load = useRuleStore((s) => s.load);
  const dirty = useRuleStore((s) => s.dirty);
  const rule = useRuleStore((s) => s.rule);
  const selection = useRuleStore((s) => s.selection);
  const select = useRuleStore((s) => s.select);
  const nodeDefs = useNodesStore((s) => s.nodes);
  const loadNodes = useNodesStore((s) => s.load);
  const loadReferences = useReferencesStore((s) => s.load);
  const [tab, setTab] = useState<Tab>("graph");
  const [testOpen, setTestOpen] = useState(false);
  const [testPrefill, setTestPrefill] = useState<RuleTest | null>(null);
  const [ruleSheetOpen, setRuleSheetOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  // When a node is selected, decide whether it gets the new centred dialog
  // or the legacy side sheet. Filter nodes get the dialog (unified config);
  // everything else keeps the sheet for now.
  const selectedInstance = selection.kind === "node" && rule
    ? rule.instances.find((i) => i.instanceId === selection.id)
    : undefined;
  const selectedDef = selectedInstance ? nodeDefs.find((n) => n.id === selectedInstance.nodeId) : undefined;
  const useUnifiedDialog = !!selectedDef && UNIFIED_DIALOG_CATEGORIES.has(selectedDef.category);

  useEffect(() => {
    load(initial);
    loadNodes();
    loadReferences();
  }, [initial, load, loadNodes, loadReferences]);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const sheetMode: "selection" | "rule" | null =
    ruleSheetOpen ? "rule"
    : (tab === "graph" && selection.kind !== "none" && !useUnifiedDialog) ? "selection"
    : null;

  function runTest(t: RuleTest) {
    setTestPrefill(t);
    setTestOpen(true);
    // Test panel slides up over the canvas; switch to graph tab so the trace shows.
    setTab("graph");
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Toolbar
        onTest={() => { setTestPrefill(null); setTestOpen((o) => !o); }}
        onOpenRuleSettings={() => setRuleSheetOpen(true)}
        onOpenAiDraft={() => setAiOpen(true)}
      />

      {/* Tab strip */}
      <div className="px-4 h-10 border-b bg-background shrink-0 flex items-center gap-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "h-9 px-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium border-b-2 -mb-px transition-colors",
                isActive
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40",
              )}
              title={t.description}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={isActive ? 2.1 : 1.8} />
              {t.label}
              {t.id === "tests" && initial.tests.length > 0 ? (
                <span className="ml-0.5 text-[10px] tabular-nums px-1 h-4 inline-flex items-center rounded bg-muted text-muted-foreground">
                  {initial.tests.length}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Tab body */}
      <div className="flex-1 flex overflow-hidden relative">
        {tab === "graph" ? (
          <>
            <div className="flex-1 min-w-0 relative">
              <Canvas />
              <TestPanel
                open={testOpen}
                onClose={() => { setTestOpen(false); setTestPrefill(null); }}
                prefill={testPrefill ? {
                  payload: testPrefill.payload,
                  label: testPrefill.name,
                  key: testPrefill.id,
                  autoRun: true,
                } : null}
              />
              <SettingsSheet
                mode={sheetMode}
                onClose={() => {
                  if (sheetMode === "rule") setRuleSheetOpen(false);
                  else select({ kind: "none" });
                }}
              />
              <NodeConfigDialog
                open={useUnifiedDialog && tab === "graph"}
                onClose={() => select({ kind: "none" })}
                instanceId={selection.kind === "node" ? selection.id : ""}
              />
              <AiDraftSheet open={aiOpen} onClose={() => setAiOpen(false)} />
            </div>
            <RightPalette />
          </>
        ) : tab === "schema" ? (
          <RuleSchemaTab />
        ) : (
          <RuleTestsTab onRunTest={runTest} />
        )}
      </div>
    </div>
  );
}
