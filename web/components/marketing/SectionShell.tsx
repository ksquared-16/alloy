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
  muted: "bg-alloy-stone/50",
  accent: "bg-gradient-to-b from-alloy-stone/30 to-white",
};

export default function SectionShell({
  children,
  id,
  className = "",
  innerClassName = "",
  variant = "default",
}: SectionShellProps) {
  return (
    <section id={id} className={`py-16 md:py-24 lg:py-28 ${variantClasses[variant]} ${className}`.trim()}>
      <div
        className={`mx-auto w-full max-w-screen-xl px-4 sm:px-6 lg:px-8 ${innerClassName}`.trim()}
      >
        {children}
      </div>
    </section>
  );
}
