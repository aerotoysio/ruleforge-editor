"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Save, Play, Settings2, Sparkles, AlertTriangle, CheckCircle2, LayoutGrid, Copy } from "lucide-react";
import { toast } from "sonner";
import { useRuleStore } from "@/lib/store/rule-store";
import { useNodesStore } from "@/lib/store/nodes-store";
import { validateRule, groupIssues, type ValidationIssue } from "@/lib/rule/validate";
import { autoLayout } from "@/lib/flow/auto-layout";
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

  // Stable refs so the keyboard handler (registered once) sees the latest values.
  // CRITICAL: ALL hooks MUST be declared BEFORE any early return — otherwise the
  // first render (rule still null) calls fewer hooks than later renders, which
  // is a Rules-of-Hooks violation that crashes the whole subtree (Canvas → no
  // edges visible). See https://react.dev/link/rules-of-hooks
  const saveRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const dirtyRef = useRef(dirty);
  const busyRef = useRef(busy);
  const errorsRef = useRef(errors);
  const ruleRef = useRef(rule);
  useEffect(() => {
    dirtyRef.current = dirty;
    busyRef.current = busy;
    errorsRef.current = errors;
    ruleRef.current = rule;
  });

  // Cmd/Ctrl+S → save (no-op if not dirty or already busy). Registered once;
  // refs above keep it pointing at the latest state.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (dirtyRef.current && !busyRef.current) {
          void saveRef.current();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!rule) return null;

  async function save(opts: { force?: boolean } = {}) {
    const errs = errorsRef.current;
    const r = ruleRef.current;
    if (!r) return;
    if (errs.length > 0 && !opts.force) {
      const ok = confirm(
        `This rule has ${errs.length} validation error${errs.length === 1 ? "" : "s"}. ` +
        `Save anyway? It'll be saved as draft — fix errors before publishing.`,
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/rules/${encodeURIComponent(r.id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(r),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Save failed");
        return;
      }
      toast.success(errs.length > 0 ? "Saved with validation errors" : "Rule saved");
      markClean();
    } finally {
      setBusy(false);
    }
  }
  saveRef.current = save;

  return (
    <header
      className="flex items-center gap-3 px-4 shrink-0"
      style={{
        height: 52,
        background: "var(--panel)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <Link
        href="/rules"
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md transition-colors"
        style={{ fontSize: 12, color: "var(--text-muted)" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--panel-2)";
          e.currentTarget.style.color = "var(--text)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--text-muted)";
        }}
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Rules
      </Link>
      <div className="h-5 w-px shrink-0" style={{ background: "var(--border)" }} />
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className="text-[14px] font-semibold tracking-tight truncate"
          style={{ color: "var(--text)" }}
          title={rule.name}
        >
          {rule.name}
        </span>
        <span
          className="mono text-[11px] truncate"
          style={{ color: "var(--text-muted)" }}
          title={rule.id}
        >
          {rule.id}
        </span>
        <StatusBadge status={rule.status} />
        <span
          className="mono text-[10.5px] px-1.5 py-0.5 rounded"
          style={{
            color: "var(--text-muted)",
            background: "var(--panel-2)",
          }}
        >
          v{rule.currentVersion}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          className="btn ghost sm"
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
        </button>
        <button
          className="btn ghost sm"
          onClick={duplicate}
          disabled={busy}
          title="Make a copy of this rule under a new id"
        >
          <Copy className="w-3.5 h-3.5" /> Duplicate
        </button>
        <button
          className="btn ghost sm"
          onClick={() => onOpenAiDraft?.()}
          title="Draft from prompt via local Ollama"
        >
          <Sparkles className="w-3.5 h-3.5" /> AI draft
        </button>
        <button
          className="btn ghost sm"
          onClick={() => onOpenRuleSettings?.()}
          title="Edit rule metadata"
        >
          <Settings2 className="w-3.5 h-3.5" /> Rule
        </button>
        <button className="btn sm" onClick={() => onTest?.()}>
          <Play className="w-3.5 h-3.5" /> Test
        </button>

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

        <div className="h-5 w-px shrink-0 mx-1" style={{ background: "var(--border)" }} />

        <span
          className={cn("status-badge", dirty ? "review" : "draft")}
          title={dirty ? "You have unsaved edits" : "All changes saved"}
        >
          <span className="dot" style={dirty ? { animation: "pulse 2s infinite" } : undefined} />
          {dirty ? "Unsaved" : "Saved"}
        </span>

        <button
          className="btn primary sm"
          onClick={() => void save()}
          disabled={busy || !dirty}
          title={dirty ? "Save (⌘S)" : "All changes saved"}
        >
          <Save className="w-3.5 h-3.5" /> Save
        </button>
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
        className="status-badge live"
        title="Rule looks good — no validation issues."
      >
        <CheckCircle2 className="w-3 h-3" />
        Valid
      </span>
    );
  }
  const tone = errors.length > 0 ? "fail" : "review";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`status-badge ${tone}`}
        title="Click to see validation issues"
        style={{ cursor: "pointer" }}
      >
        <AlertTriangle className="w-3 h-3" />
        {errors.length > 0 ? `${errors.length} ${errors.length === 1 ? "error" : "errors"}` : null}
        {errors.length > 0 && warnings.length > 0 ? " · " : null}
        {warnings.length > 0 ? `${warnings.length} ${warnings.length === 1 ? "warning" : "warnings"}` : null}
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-1.5 z-20 w-[420px] max-h-[400px] overflow-auto"
            style={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              boxShadow: "var(--shadow-md)",
            }}
          >
            <div
              className="px-3 py-2 text-[11px] uppercase tracking-wider font-semibold"
              style={{
                borderBottom: "1px solid var(--border)",
                background: "var(--panel-2)",
                color: "var(--text-muted)",
              }}
            >
              Issues
            </div>
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              {[...errors, ...warnings].map((issue, i) => (
                <button
                  key={i}
                  onClick={() => onJump(issue.target)}
                  className="w-full text-left px-3 py-2 flex items-start gap-2 transition-colors"
                  style={{ background: "transparent" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--panel-2)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <div
                    className="w-4 h-4 rounded-full inline-flex items-center justify-center shrink-0 mt-0.5"
                    style={{
                      background: issue.severity === "error" ? "var(--danger-soft)" : "var(--warn-soft)",
                      color: issue.severity === "error" ? "var(--danger)" : "var(--warn)",
                    }}
                  >
                    <AlertTriangle className="w-2.5 h-2.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] leading-snug" style={{ color: "var(--text)" }}>
                      {issue.message}
                    </div>
                    <div className="text-[10px] mono mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {issue.kind} ·{" "}
                      {issue.target.kind === "instance"
                        ? issue.target.instanceId
                        : issue.target.kind === "edge"
                        ? issue.target.edgeId
                        : "rule"}
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
