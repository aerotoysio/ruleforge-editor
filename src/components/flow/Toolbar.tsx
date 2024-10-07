"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Save, Play, Settings2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useRuleStore } from "@/lib/store/rule-store";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";

type Props = {
  onTest?: () => void;
  onOpenRuleSettings?: () => void;
  onOpenAiDraft?: () => void;
};

export function Toolbar({ onTest, onOpenRuleSettings, onOpenAiDraft }: Props = {}) {
  const rule = useRuleStore((s) => s.rule);
  const dirty = useRuleStore((s) => s.dirty);
  const markClean = useRuleStore((s) => s.markClean);
  const [busy, setBusy] = useState(false);

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
        <Button variant="ghost" size="sm" onClick={() => onOpenAiDraft?.()} title="Draft from prompt via local Ollama">
          <Sparkles className="w-3.5 h-3.5" /> AI draft
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onOpenRuleSettings?.()} title="Edit rule metadata">
          <Settings2 className="w-3.5 h-3.5" /> Rule
        </Button>
        <Button variant="outline" size="sm" onClick={() => onTest?.()}>
          <Play className="w-3.5 h-3.5" /> Test
        </Button>

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
