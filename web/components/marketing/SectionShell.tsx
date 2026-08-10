import type { ReactNode } from "react";

interface SectionShellProps {
  children: ReactNode;
  id?: string;
  className?: string;
  innerClassName?: string;
  /** Surface color — prefer sparse muted chapters, not strict alternation */
  variant?: "default" | "muted" | "accent";
  /** Vertical rhythm for chapter pacing */
  density?: "default" | "compact" | "spacious";
}

const variantClasses = {
  default: "bg-white",
  muted: "bg-alloy-stone",
  accent: "bg-gradient-to-b from-alloy-stone to-white",
};

const densityClasses = {
  default: "marketing-section-pad",
  compact: "marketing-section-pad-compact",
  spacious: "marketing-section-pad-spacious",
};

export default function SectionShell({
  children,
  id,
  className = "",
  innerClassName = "",
  variant = "default",
  density = "default",
}: SectionShellProps) {
  return (
    <section
      id={id}
      className={`${densityClasses[density]} ${variantClasses[variant]} ${className}`.trim()}
    >
      <div className={`marketing-content-width ${innerClassName}`.trim()}>{children}</div>
    </section>
  );
}
