import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
};

export function EmptyState({ title, description, action, icon }: Props) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{
        padding: "56px 24px",
        borderRadius: "var(--radius-lg)",
        border: "1px dashed var(--border)",
        background: "var(--panel-2)",
      }}
    >
      {icon ? (
        <div
          className="mb-4 flex items-center justify-center"
          style={{
            width: 52,
            height: 52,
            borderRadius: 999,
            background: "var(--accent-soft)",
            color: "var(--accent)",
          }}
        >
          {icon}
        </div>
      ) : null}
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: "-0.012em",
          color: "var(--text)",
        }}
      >
        {title}
      </div>
      {description ? (
        <p
          style={{
            marginTop: 6,
            maxWidth: 420,
            fontSize: 12.5,
            color: "var(--text-muted)",
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
      ) : null}
      {action ? <div style={{ marginTop: 18 }}>{action}</div> : null}
    </div>
  );
}
