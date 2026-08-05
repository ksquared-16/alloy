import type { ReactNode } from "react";

interface SectionShellProps {
  children: ReactNode;
  id?: string;
  className?: string;
  innerClassName?: string;
  /** Alternate background for rhythm between sections */
  variant?: "default" | "muted" | "accent";
}

const variantClasses = {
  default: "bg-white",
  muted: "bg-alloy-stone",
  accent: "bg-gradient-to-b from-alloy-stone to-white",
};

export default function SectionShell({
  children,
  id,
  className = "",
  innerClassName = "",
  variant = "default",
}: SectionShellProps) {
  return (
    <section
      id={id}
      className={`marketing-section-pad ${variantClasses[variant]} ${className}`.trim()}
    >
      <div className={`marketing-content-width ${innerClassName}`.trim()}>{children}</div>
    </section>
  );
}
