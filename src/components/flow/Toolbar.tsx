"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, Save, Play, Settings2, Sparkles, AlertTriangle, CheckCircle2, LayoutGrid, Copy } from "lucide-react";
import { toast } from "sonner";
import { useRuleStore } from "@/lib/store/rule-store";
import { useNodesStore } from "@/lib/store/nodes-store";
import { validateRule, groupIssues, type ValidationIssue } from "@/lib/rule/validate";
import { autoLayout } from "@/lib/flow/auto-layout";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";

type Props = {
  onTest?: () => void;
  onOpenRuleSettings?: () => void;
  onOpenAiDraft?: () => void;
};

export function Toolbar({ onTest, onOpenRuleSettings, onOpenAiDraft }: Props = {}) {
  const router = useRouter();
  const rule = useRuleStore((s) => s.rule);
  const select = useRuleStore((s) => s.select);
  const setInstances = useRuleStore((s) => s.setInstances);
  const dirty = useRuleStore((s) => s.dirty);
  const markClean = useRuleStore((s) => s.markClean);
  const nodeDefs = useNodesStore((s) => s.nodes);
  const [busy, setBusy] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);

  async function duplicate() {
    if (!rule) return;
    if (dirty && !confirm("You have unsaved changes — duplicate the saved version on disk and discard them?")) return;
    setBusy(true);
    try {
      const baseId = rule.id;
      const newId = await pickAvailableId(`${baseId}-copy`);
      if (!newId) {
        toast.error("Couldn't find an available id");
        return;
      }
      // Fetch the saved-on-disk version (so unsaved drafts don't leak)
      const res = await fetch(`/api/rules/${encodeURIComponent(baseId)}`);
      if (!res.ok) {
        toast.error("Failed to read original rule");
        return;
      }
      const data = await res.json();
      const next = {
        ...data.rule,
        id: newId,
        name: `${data.rule.name} (copy)`,
        status: "draft" as const,
        currentVersion: 1,
        updatedAt: new Date().toISOString(),
        // Tests retain their ids — those are local to the rule scope
      };
      const writeRes = await fetch(`/api/rules/${encodeURIComponent(newId)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!writeRes.ok) {
        const err = await writeRes.json().catch(() => ({}));
        toast.error(err.error ?? "Duplicate failed");
        return;
      }
      toast.success(`Duplicated as "${next.name}"`);
      router.push(`/rules/${encodeURIComponent(newId)}`);
    } finally {
      setBusy(false);
    }
  }

  const issues = useMemo(
    () => (rule && nodeDefs.length > 0 ? validateRule(rule, nodeDefs) : []),
    [rule, nodeDefs],
  );
  const { errors, warnings } = useMemo(() => groupIssues(issues), [issues]);

  if (!rule) return null;

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/rules/${encodeURIComponent(rule!.id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(rule),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Save failed");
        return;
      }
      toast.success("Rule saved");
      markClean();
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="px-4 h-14 border-b bg-background shrink-0 flex items-center gap-3">
      <Link
        href="/rules"
        className="inline-flex items-center gap-1 text-[12px] px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Rules
      </Link>
      <div className="h-5 w-px bg-border shrink-0" />
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="text-[14px] font-semibold tracking-tight text-foreground truncate" title={rule.name}>{rule.name}</span>
        <span className="font-mono text-[11px] text-muted-foreground truncate" title={rule.id}>{rule.id}</span>
        <StatusBadge status={rule.status} />
        <span className="font-mono text-[10.5px] text-muted-foreground/80 px-1.5 py-0.5 rounded bg-muted/50">v{rule.currentVersion}</span>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (!rule || rule.instances.length === 0) return;
            const positions = autoLayout(
              rule.instances.map((i) => ({ id: i.instanceId })),
              rule.edges.map((e) => ({ source: e.source, target: e.target })),
            );
            const next = rule.instances.map((i) => {
              const pos = positions.get(i.instanceId);
              return pos ? { ...i, position: pos } : i;
            });
            setInstances(next);
            toast.success("Re-laid out the canvas");
          }}
          title="Re-arrange nodes left-to-right by graph order"
        >
          <LayoutGrid className="w-3.5 h-3.5" /> Layout
        </Button>
        <Button variant="ghost" size="sm" onClick={duplicate} disabled={busy} title="Make a copy of this rule under a new id">
          <Copy className="w-3.5 h-3.5" /> Duplicate
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onOpenAiDraft?.()} title="Draft from prompt via local Ollama">
          <Sparkles className="w-3.5 h-3.5" /> AI draft
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onOpenRuleSettings?.()} title="Edit rule metadata">
          <Settings2 className="w-3.5 h-3.5" /> Rule
        </Button>
        <Button variant="outline" size="sm" onClick={() => onTest?.()}>
          <Play className="w-3.5 h-3.5" /> Test
        </Button>

        {/* Rule-validity indicator. Click to open the issues popover. */}
        <ValidityBadge
          issues={issues}
          errors={errors}
          warnings={warnings}
          open={issuesOpen}
          setOpen={setIssuesOpen}
          onJump={(target) => {
            if (target.kind === "instance") select({ kind: "node", id: target.instanceId });
            if (target.kind === "edge") select({ kind: "edge", id: target.edgeId });
            setIssuesOpen(false);
          }}
        />

        <div className="h-5 w-px bg-border shrink-0 mx-1" />

        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2 h-6 rounded-full text-[10.5px] font-medium border transition-colors",
            dirty
              ? "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900"
              : "bg-muted/50 text-muted-foreground border-border",
          )}
          title={dirty ? "You have unsaved edits" : "All changes saved"}
        >
          <span className={cn("w-1.5 h-1.5 rounded-full", dirty ? "bg-amber-500 animate-pulse" : "bg-muted-foreground/40")} />
          {dirty ? "Unsaved" : "Saved"}
        </span>

        <Button variant="default" size="sm" onClick={save} disabled={busy || !dirty}>
          <Save className="w-3.5 h-3.5" /> Save
        </Button>
      </div>
    </header>
  );
}

async function pickAvailableId(seed: string): Promise<string | null> {
  // Try seed, seed-2, seed-3, … until /api/rules/[id] returns 404.
  for (let n = 1; n <= 20; n++) {
    const candidate = n === 1 ? seed : `${seed}-${n}`;
    try {
      const res = await fetch(`/api/rules/${encodeURIComponent(candidate)}`);
      if (res.status === 404) return candidate;
    } catch {
      return candidate;
    }
  }
  return null;
}

function ValidityBadge({
  issues,
  errors,
  warnings,
  open,
  setOpen,
  onJump,
}: {
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  open: boolean;
  setOpen: (b: boolean) => void;
  onJump: (target: ValidationIssue["target"]) => void;
}) {
  if (issues.length === 0) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 h-6 rounded-full text-[10.5px] font-medium border bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900"
        title="Rule looks good — no validation issues."
      >
        <CheckCircle2 className="w-3 h-3" />
        Valid
      </span>
    );
  }
  const tone = errors.length > 0
    ? "bg-red-50 text-red-900 border-red-200 dark:bg-red-950/30 dark:text-red-200 dark:border-red-900"
    : "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center gap-1.5 px-2 h-6 rounded-full text-[10.5px] font-medium border transition-colors hover:opacity-90",
          tone,
        )}
        title="Click to see validation issues"
      >
        <AlertTriangle className="w-3 h-3" />
        {errors.length > 0 ? `${errors.length} ${errors.length === 1 ? "error" : "errors"}` : null}
        {errors.length > 0 && warnings.length > 0 ? " · " : null}
        {warnings.length > 0 ? `${warnings.length} ${warnings.length === 1 ? "warning" : "warnings"}` : null}
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-20 w-[420px] max-h-[400px] overflow-auto rounded-lg border bg-popover shadow-lg">
            <div className="px-3 py-2 border-b bg-muted/30 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground/80">
              Issues
            </div>
            <div className="divide-y">
              {[...errors, ...warnings].map((issue, i) => (
                <button
                  key={i}
                  onClick={() => onJump(issue.target)}
                  className="w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-muted/40 transition-colors"
                >
                  <div className={cn(
                    "w-4 h-4 rounded-full inline-flex items-center justify-center shrink-0 mt-0.5",
                    issue.severity === "error" ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
                  )}>
                    <AlertTriangle className="w-2.5 h-2.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] text-foreground leading-snug">{issue.message}</div>
                    <div className="text-[10px] text-muted-foreground/80 font-mono mt-0.5">
                      {issue.kind} · {issue.target.kind === "instance" ? issue.target.instanceId : issue.target.kind === "edge" ? issue.target.edgeId : "rule"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
