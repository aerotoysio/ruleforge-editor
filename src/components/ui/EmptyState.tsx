import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
};

export function EmptyState({ title, description, action, icon }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-8 py-16 rounded-lg border border-dashed bg-card">
      {icon ? (
        <div className="mb-4 w-14 h-14 rounded-full bg-muted/60 text-muted-foreground flex items-center justify-center">
          {icon}
        </div>
      ) : null}
      <div className="text-[15px] font-semibold tracking-tight text-foreground">{title}</div>
      {description ? (
        <p className="mt-1.5 max-w-md text-[13px] text-muted-foreground leading-relaxed">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
