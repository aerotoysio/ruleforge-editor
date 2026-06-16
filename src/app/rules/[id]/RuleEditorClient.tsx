"use client";

import { useEffect, useState } from "react";
import { Workflow, Braces, FlaskConical, BookOpen } from "lucide-react";
import type { Rule, RuleTest } from "@/lib/types";
import { useRuleStore } from "@/lib/store/rule-store";
import { useReferencesStore } from "@/lib/store/references-store";
import { useTemplatesStore } from "@/lib/store/templates-store";
import { useAssetsStore } from "@/lib/store/assets-store";
import { useNodesStore } from "@/lib/store/nodes-store";
import { Canvas } from "@/components/flow/Canvas";
import { Toolbar } from "@/components/flow/Toolbar";
import { TestPanel } from "@/components/flow/TestPanel";
import { RightPalette } from "@/components/flow/RightPalette";
import { SettingsSheet } from "@/components/designer/SettingsSheet";
import { AiDraftBar } from "@/components/flow/AiDraftBar";
import { RuleSchemaTab } from "@/components/flow/RuleSchemaTab";
import { RuleTestsTab } from "@/components/flow/RuleTestsTab";
import { RuleSummaryTab } from "@/components/flow/RuleSummaryTab";
import { NodeConfigDialog } from "@/components/bindings/NodeConfigDialog";
import { cn } from "@/lib/utils";

// Categories that get the new unified single-popup config experience.
// Terminal nodes (input/output) don't open a dialog — they have nothing to
// configure beyond the inline label-edit on canvas. Everything else uses the
// dialog so the side sheet's job becomes purely metadata browsing.
// The unified node dialog is the single editor for every node category — one
// consistent form (with the Raw tab, matchOn editor, calc builder, structured
// rows and no-config signposting) rather than a separate per-category panel.
const UNIFIED_DIALOG_CATEGORIES = new Set([
  "filter", "mutator", "calc", "textParse", "iterator", "merge", "constant", "ruleRef",
  "product", "logic", "assert", "switch", "bucket", "sort", "limit",
  "distinct", "groupBy", "join", "reference", "api", "input", "output",
]);

type Tab = "graph" | "summary" | "schema" | "tests";

const TABS: { id: Tab; label: string; icon: typeof Workflow; description: string }[] = [
  { id: "graph",   label: "Graph",   icon: Workflow,     description: "Drag nodes onto the canvas and bind their ports" },
  { id: "summary", label: "Summary", icon: BookOpen,     description: "Plain-English narrative + policy citations (AI-authored)" },
  { id: "schema",  label: "Schema",  icon: Braces,       description: "Define the input, output, and context shapes" },
  { id: "tests",   label: "Tests",   icon: FlaskConical, description: "Canonical scenarios to run this rule against" },
];

export function RuleEditorClient({ initial }: { initial: Rule }) {
  const load = useRuleStore((s) => s.load);
  const dirty = useRuleStore((s) => s.dirty);
  const rule = useRuleStore((s) => s.rule);
  const selection = useRuleStore((s) => s.selection);
  const select = useRuleStore((s) => s.select);
  const editingInstanceId = useRuleStore((s) => s.editingInstanceId);
  const requestEdit = useRuleStore((s) => s.requestEdit);
  const nodeDefs = useNodesStore((s) => s.nodes);
  const loadNodes = useNodesStore((s) => s.load);
  const loadReferences = useReferencesStore((s) => s.load);
  const loadTemplates = useTemplatesStore((s) => s.load);
  const loadAssets = useAssetsStore((s) => s.load);
  const [tab, setTab] = useState<Tab>("graph");
  const [testOpen, setTestOpen] = useState(false);
  const [testPrefill, setTestPrefill] = useState<RuleTest | null>(null);
  const [ruleSheetOpen, setRuleSheetOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  // The configure dialog opens ONLY when an explicit "edit" gesture sets
  // editingInstanceId — single-click on a node just selects (and lets it
  // drag freely). The cog icon on the node, the right-click context menu,
  // and double-click on the node body all set this.
  const editingInstance = editingInstanceId && rule
    ? rule.instances.find((i) => i.instanceId === editingInstanceId)
    : undefined;
  const editingDef = editingInstance ? nodeDefs.find((n) => n.id === editingInstance.nodeId) : undefined;
  const useUnifiedDialog = !!editingDef && UNIFIED_DIALOG_CATEGORIES.has(editingDef.category);

  useEffect(() => {
    load(initial);
    loadNodes();
    loadReferences();
    loadTemplates();
    loadAssets();
  }, [initial, load, loadNodes, loadReferences, loadTemplates, loadAssets]);

  // Open the test panel immediately when arrived via the rules-list "Test"
  // action (/rules/[id]?test=1). Read the query client-side to avoid Next's
  // useSearchParams Suspense requirement.
  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("test") === "1") {
      setTab("graph");
      setTestOpen(true);
    }
  }, []);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Side sheet now only opens for the "Rule" toolbar button (rule metadata)
  // and for edge selection (no popup yet for edges). Node selection routes
  // entirely through the dialog. Terminal nodes (input/output) get no UI —
  // they're configured via the inline label-edit on canvas.
  const sheetMode: "selection" | "rule" | null =
    ruleSheetOpen ? "rule"
    : (tab === "graph" && selection.kind === "edge") ? "selection"
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
      <div className="builder-tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn("builder-tab", isActive && "on")}
              title={t.description}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={isActive ? 2.1 : 1.8} />
              {t.label}
              {t.id === "tests" && initial.tests.length > 0 ? (
                <span className="pill">{initial.tests.length}</span>
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
                onClose={() => requestEdit(null)}
                instanceId={editingInstanceId ?? ""}
              />
              <AiDraftBar open={aiOpen} onClose={() => setAiOpen(false)} />
            </div>
            <RightPalette />
          </>
        ) : tab === "summary" ? (
          <RuleSummaryTab onJumpToNode={(iid) => { setTab("graph"); select({ kind: "node", id: iid }); }} />
        ) : tab === "schema" ? (
          <RuleSchemaTab />
        ) : (
          <RuleTestsTab onRunTest={runTest} />
        )}
      </div>
    </div>
  );
}
