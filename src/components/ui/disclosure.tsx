import type { ComponentPropsWithoutRef, ReactNode } from "react";
import "./disclosure.css";

type DisclosureProps = ComponentPropsWithoutRef<"details"> & {
  label: ReactNode;
  compact?: boolean;
};

export function Disclosure({
  label,
  compact,
  className,
  children,
  ...props
}: DisclosureProps) {
  return (
    <details
      {...props}
      className={["edu-disclosure", className].filter(Boolean).join(" ")}
      data-compact={compact ? "" : undefined}
    >
      <summary className="edu-disclosure-heading">
        <span className="edu-disclosure-label">{label}</span>
      </summary>
      <div className="edu-disclosure-body">{children}</div>
    </details>
  );
}
