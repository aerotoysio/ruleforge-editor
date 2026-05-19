type Props = {
  title: string;
  subtitle?: string;
  badge?: string;
  accent?: string;
};

export function DesignerHeader({ title, subtitle, badge, accent = "#64748b" }: Props) {
  return (
    <header className="popup-head" style={{ paddingRight: 20 }}>
      {badge ? (
        <span className="badge" style={{ background: accent }}>
          {badge}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <span className="title block truncate" title={title}>
          {title}
        </span>
        {subtitle ? (
          <span
            className="subtitle mono block"
            style={{ fontFamily: "var(--font-mono)" }}
            title={subtitle}
          >
            {subtitle}
          </span>
        ) : null}
      </div>
    </header>
  );
}
