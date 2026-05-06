import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: ReactNode;
};

export function PageHeader({ title, description, actions, eyebrow }: Props) {
  return (
    <header className="flex items-end justify-between gap-4 px-8 py-5 border-b bg-background/95 backdrop-blur shrink-0">
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/80 font-medium mb-1">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="text-[20px] font-semibold tracking-tight text-foreground leading-tight">
          {title}
        </h1>
        {description ? (
          <p className="text-[13px] text-muted-foreground mt-1 max-w-[60ch]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
    </header>
  );
}
