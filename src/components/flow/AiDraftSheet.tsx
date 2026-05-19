"use client";

import { Sparkles, X } from "lucide-react";
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

        <header className="popup-head" style={{ paddingRight: 20 }}>
          <span
            className="badge"
            style={{
              background: "var(--accent-soft)",
              color: "var(--accent)",
            }}
          >
            <Sparkles className="w-4 h-4" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="title block">AI draft</span>
            <span className="subtitle block">Generate a rule from a prompt</span>
          </div>
          <button
            onClick={onClose}
            className="icon-btn"
            style={{ width: 28, height: 28 }}
            aria-label="Close AI draft"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </header>

        <div className="popup-body" style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              border: "1px dashed var(--border)",
              background: "var(--panel-2)",
              borderRadius: 8,
              padding: "28px 24px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: 10,
              maxWidth: 380,
              margin: "0 auto",
            }}
          >
            <Sparkles
              className="w-7 h-7"
              style={{ color: "var(--accent)" }}
            />
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
              AI draft is being rewired
            </div>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              The rule shape changed (instances + bindings against a global node library). The AI draft flow will return shortly — it now needs to emit node-instance + binding shapes instead of inline node configs.
            </p>
            <button
              className="btn ghost sm"
              onClick={onClose}
              style={{ marginTop: 8 }}
            >
              Close
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
