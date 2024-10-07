import type { RuleStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STYLES: Record<RuleStatus, { label: string; className: string; dot: string }> = {
  draft: {
    label: "Draft",
    className: "bg-muted/60 text-muted-foreground border-border",
    dot: "bg-muted-foreground/60",
  },
  review: {
    label: "Review",
    className: "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900",
    dot: "bg-amber-500",
  },
  published: {
    label: "Published",
    className: "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900",
    dot: "bg-emerald-500",
  },
};

export function StatusBadge({ status }: { status: RuleStatus }) {
  const s = STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 h-5 text-[10.5px] font-medium rounded-full border tracking-wide",
        s.className,
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}
