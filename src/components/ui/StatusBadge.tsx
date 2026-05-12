import type { RuleStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Status pill — ported from the Claude Design handoff. Uses the
 * `.status-badge` CSS class defined in `globals.css` (which drives the
 * background / fg / dot via the design's tone variables: `success-soft`,
 * `warn-soft`, etc.).
 *
 * The design vocabulary maps to ours like this:
 *   editor "draft"     → design "draft"
 *   editor "review"    → design "review"
 *   editor "published" → design "live"
 *
 * Extra statuses the design supports but we don't emit today are exposed
 * via the union below — useful for rendering at the API boundary if the
 * engine surfaces `disabled` / `fail` for a rule.
 */
export type StatusTone = RuleStatus | "live" | "disabled" | "fail" | "error";

const TONE_FOR: Record<StatusTone, string> = {
  draft: "draft",
  review: "review",
  published: "live",
  live: "live",
  disabled: "disabled",
  fail: "fail",
  error: "error",
};

const LABEL_FOR: Record<StatusTone, string> = {
  draft: "Draft",
  review: "In review",
  published: "Live",
  live: "Live",
  disabled: "Disabled",
  fail: "Failing",
  error: "Error",
};

type Props = {
  status: StatusTone;
  /** Override the rendered label without touching the tone. */
  label?: string;
  className?: string;
};

export function StatusBadge({ status, label, className }: Props) {
  const tone = TONE_FOR[status] ?? "draft";
  return (
    <span className={cn("status-badge", tone, className)}>
      <span className="dot" aria-hidden />
      {label ?? LABEL_FOR[status] ?? status}
    </span>
  );
}
