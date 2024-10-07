"use client";

import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AiDraftSheet({ open, onClose }: Props) {
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent
        side="right"
        className="w-[480px] sm:max-w-[480px] p-0 gap-0 flex flex-col"
      >
        <SheetTitle className="sr-only">AI draft</SheetTitle>
        <SheetDescription className="sr-only">
          Draft a rule from a natural-language prompt.
        </SheetDescription>

        <header className="px-4 h-14 border-b shrink-0 flex items-center gap-2 bg-card">
          <div className="w-8 h-8 rounded-md bg-violet-100 text-violet-700 flex items-center justify-center dark:bg-violet-950 dark:text-violet-300">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[13px] font-semibold tracking-tight text-foreground">AI draft</span>
            <span className="text-[10.5px] text-muted-foreground">Generate a rule from a prompt</span>
          </div>
          <button onClick={onClose} className="ml-auto w-8 h-8 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted">
            <X className="w-3.5 h-3.5" />
          </button>
        </header>

        <div className="flex-1 overflow-auto px-5 py-6 flex flex-col gap-4">
          <div className="rounded-md border border-dashed bg-muted/30 px-4 py-6 flex flex-col items-center text-center gap-2">
            <Sparkles className="w-8 h-8 text-muted-foreground" />
            <div className="text-[13px] font-medium text-foreground">AI draft is being rewired</div>
            <p className="text-[12px] text-muted-foreground max-w-sm leading-relaxed">
              The rule shape changed (instances + bindings against a global node library). The AI draft
              flow will return shortly — it now needs to emit node-instance + binding shapes instead of
              inline node configs.
            </p>
            <Button variant="ghost" size="sm" onClick={onClose} className="mt-2">
              Close
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
