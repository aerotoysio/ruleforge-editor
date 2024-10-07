"use client";

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  as?: "div" | "button" | "a";
  href?: string;
};

export function Card({ children, className = "", onClick, as = "div", href }: Props) {
  const style: React.CSSProperties = {
    background: "var(--color-bg)",
    border: "1px solid var(--color-border)",
  };
  const cls = `rounded transition-colors ${onClick || href ? "cursor-pointer hover:border-fg-dim" : ""} ${className}`;
  if (as === "a" && href) return <a href={href} className={cls} style={style}>{children}</a>;
  if (as === "button") return <button className={cls} style={style} onClick={onClick}>{children}</button>;
  return <div className={cls} style={style} onClick={onClick}>{children}</div>;
}
