"use client";

import { forwardRef, type SelectHTMLAttributes } from "react";

type Props = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { className = "", style, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={`h-8 px-2 text-[13px] rounded w-full ${className}`}
      style={{
        background: "var(--color-bg)",
        color: "var(--color-fg)",
        border: "1px solid var(--color-border-strong)",
        ...style,
      }}
      {...rest}
    />
  );
});
