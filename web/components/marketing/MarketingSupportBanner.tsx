import type { ReactNode } from "react";

/**
 * Shared marketing support-banner system.
 * Baseline typography = hero principles row (compact, scannable).
 * Color: Midnight Forge structure + Slate body + restrained Bend Pine signal.
 */

export type MarketingSupportItem = {
  title: string;
  body: string;
  /** Rendered icon — target ~18px; Midnight stroke + optional Pine detail */
  icon: ReactNode;
};

type Columns = 4 | 6;

const columnClasses: Record<Columns, string> = {
  4: "grid-cols-2 md:grid-cols-4 md:gap-x-0",
  6: "grid-cols-2 md:grid-cols-3 lg:grid-cols-6 lg:gap-x-0",
};

const dividerBreakpoint: Record<Columns, string> = {
  4: "md:border-l md:border-alloy-midnight-forge/[0.08] md:px-4",
  6: "lg:border-l lg:border-alloy-midnight-forge/[0.08] lg:px-4",
};

export default function MarketingSupportBanner({
  items,
  columns,
  ariaLabel,
  align = "left",
  className = "",
}: {
  items: readonly MarketingSupportItem[];
  columns: Columns;
  ariaLabel: string;
  align?: "left" | "center";
  className?: string;
}) {
  const alignClass = align === "center" ? "items-center text-center" : "items-start text-left";

  return (
    <ul
      aria-label={ariaLabel}
      className={`grid items-start gap-x-6 gap-y-6 ${columnClasses[columns]} ${className}`.trim()}
    >
      {items.map((item, index) => (
        <li
          key={item.title}
          className={`flex flex-col gap-2 ${alignClass} ${
            index > 0 ? dividerBreakpoint[columns] : columns === 4 ? "md:px-4" : "lg:px-4"
          }`}
        >
          {item.icon}
          <div className="min-w-0">
            <h3 className="text-[0.8125rem] font-semibold leading-snug tracking-[-0.01em] text-alloy-midnight-forge">
              {item.title}
            </h3>
            <p className="mt-1 text-[0.75rem] leading-snug text-alloy-midnight-forge/60">
              {item.body}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
