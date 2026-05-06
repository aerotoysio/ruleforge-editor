type Props = {
  title: string;
  subtitle?: string;
  badge?: string;
  accent?: string;
};

export function DesignerHeader({ title, subtitle, badge, accent = "#64748b" }: Props) {
  return (
    <header className="px-4 py-3 border-b shrink-0 flex items-center gap-2.5 bg-card">
      {badge ? (
        <span
          className="inline-flex items-center justify-center w-9 h-9 rounded-md text-[10px] font-bold font-mono tracking-wide"
          style={{ background: accent, color: "#fff" }}
        >
          {badge}
        </span>
      ) : null}
      <div className="min-w-0 flex flex-col leading-tight">
        <span className="text-[14px] font-semibold tracking-tight text-foreground truncate" title={title}>
          {title}
        </span>
        {subtitle ? (
          <span className="text-[11px] font-mono text-muted-foreground truncate" title={subtitle}>
            {subtitle}
          </span>
        ) : null}
      </div>
    </header>
  );
}
