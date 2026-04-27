"use client";

import { ReactNode, useState } from "react";
import type { EntityDrawerSectionConfig } from "@/lib/entityPresentation";

const SECTION_HEADER_CLASS =
  "rounded-t-md bg-alloy-stone/30 border-b border-admin-border px-3 py-2 mb-3 text-xs font-semibold uppercase tracking-wider text-alloy-forge";

/** Pine accent — aligned with inquiry workflow snapshot header cards. */
const PREMIUM_SECTION =
  "rounded-lg border border-alloy-stone/20 border-l-[3px] border-l-[rgb(0,162,131)] bg-white/90 shadow-sm shadow-alloy-stone/10 ring-1 ring-alloy-stone/10 overflow-hidden";
const PREMIUM_HEADER_BTN =
  "flex w-full items-center justify-between gap-2 border-b border-alloy-stone/15 bg-alloy-stone/[0.05] px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-alloy-forge/80 transition-colors duration-150 hover:bg-alloy-stone/10";
const PREMIUM_HEADER_STATIC =
  "border-b border-alloy-stone/15 bg-alloy-stone/[0.05] px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-alloy-forge/80";

interface EntityDrawerSectionProps {
  config: EntityDrawerSectionConfig;
  children: ReactNode;
  /** Override default expanded state (e.g. from persisted layout). */
  defaultExpanded?: boolean;
  className?: string;
  /** Card-style sections with left accent (workflow inquiry drawer). */
  surface?: "default" | "premium";
}

/**
 * Renders a drawer section with optional collapse. Uses config for title, collapsible, and grid.
 * Children are the section content (e.g. list of EntityDrawerField or custom content).
 */
export default function EntityDrawerSection({
  config,
  children,
  defaultExpanded,
  className = "",
  surface = "default",
}: EntityDrawerSectionProps) {
  const isPremium = surface === "premium";
  const isCollapsible = config.collapsible ?? false;
  const [expanded, setExpanded] = useState(defaultExpanded ?? config.defaultExpanded ?? false);
  const showContent = !isCollapsible || expanded;
  const gridCols = config.gridCols === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1";

  return (
    <section
      className={`${isPremium ? `mb-0 ${PREMIUM_SECTION} ${isCollapsible && !expanded ? "shadow-md shadow-alloy-stone/15" : ""}` : "mb-6"} ${className}`}
      data-entity-section
      data-section-key={config.key}
      data-section-surface={surface}
    >
      {isCollapsible ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className={`entity-drawer-section-toggle ${
            isPremium
              ? PREMIUM_HEADER_BTN
              : `flex w-full items-center justify-between gap-2 text-left transition-colors duration-150 ${SECTION_HEADER_CLASS}`
          }`}
          aria-expanded={expanded}
        >
          <span>{config.title}</span>
          <span className="text-alloy-muted transition-opacity duration-150" aria-hidden>
            {expanded ? "−" : "+"}
          </span>
        </button>
      ) : (
        <h3 className={isPremium ? PREMIUM_HEADER_STATIC : SECTION_HEADER_CLASS}>{config.title}</h3>
      )}
      {showContent && (
        <div
          className={
            isPremium
              ? `min-w-0 w-full px-3 pb-3 pt-2.5 grid gap-x-4 gap-y-2 ${gridCols} [&>*]:min-w-0`
              : `grid gap-x-4 gap-y-2 ${gridCols} ${isCollapsible ? "mt-2" : "mt-3"}`
          }
        >
          {children}
        </div>
      )}
    </section>
  );
}
