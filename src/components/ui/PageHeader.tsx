import type { ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: ReactNode;
};

/**
 * Page header — uses the design's `.page-head` class. Every page that wants
 * the standard "title / description / right-aligned actions" shape passes
 * raw button markup (or links) through `actions`. Prefer `.btn` / `.btn.primary`
 * inside `actions` so the whole app shares one button vocabulary.
 */
export function PageHeader({ title, description, actions, eyebrow }: Props) {
  return (
    <div className="page-head" style={{ paddingTop: 22, paddingLeft: 28, paddingRight: 28 }}>
      <div className="min-w-0">
        {eyebrow ? (
          <div
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: "var(--text-muted)",
              fontWeight: 500,
              marginBottom: 4,
            }}
          >
            {eyebrow}
          </div>
        ) : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}
