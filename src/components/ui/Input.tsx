"use client";

import { forwardRef, type InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { className = "", invalid, style, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={`h-8 px-2.5 text-[13px] rounded w-full ${className}`}
      style={{
        background: "var(--color-bg)",
        color: "var(--color-fg)",
        border: `1px solid ${invalid ? "var(--color-fail)" : "var(--color-border-strong)"}`,
        ...style,
      }}
      {...rest}
    />
  );
});
