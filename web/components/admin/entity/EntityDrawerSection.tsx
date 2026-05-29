"use client";

import { ReactNode, useState } from "react";
import type { EntityDrawerSectionConfig } from "@/lib/entityPresentation";

const SECTION_HEADER_CLASS =
  "rounded-t-md bg-alloy-stone/30 border-b border-admin-border px-3 py-2 mb-3 text-xs font-semibold tracking-wider text-alloy-forge";

/** Pine accent — aligned with inquiry workflow snapshot header cards. */
const PREMIUM_SECTION =
  "rounded-lg border border-alloy-stone/20 border-l-[3px] border-l-[rgb(0,162,131)] bg-gradient-to-br from-emerald-50/35 via-white/95 to-white shadow-sm shadow-alloy-stone/10 ring-1 ring-alloy-stone/10 overflow-hidden";
const PREMIUM_HEADER_STATIC =
  "border-b border-alloy-stone/15 bg-alloy-stone/[0.05] px-2.5 py-1.5 text-[10px] font-semibold tracking-[0.1em] text-alloy-forge/80";

interface EntityDrawerSectionProps {
  config: EntityDrawerSectionConfig;
  children: ReactNode;
  headerRight?: ReactNode;
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
  headerRight,
  defaultExpanded,
  className = "",
  surface = "default",
}: EntityDrawerSectionProps) {
  const isPremium = surface === "premium";
  const isCollapsible = config.collapsible ?? false;
  const [expanded, setExpanded] = useState(defaultExpanded ?? config.defaultExpanded ?? false);
  const showContent = !isCollapsible || expanded;
  const gridCols =
    config.gridCols === 3
      ? "grid-cols-1 md:grid-cols-3"
      : config.gridCols === 2
        ? "grid-cols-1 md:grid-cols-2"
        : "grid-cols-1";
  const blockContent = config.contentLayout === "block";

  return (
    <section
      className={`${
        isPremium
          ? `mb-3.5 ${PREMIUM_SECTION} ${isCollapsible && !expanded ? "shadow-md shadow-alloy-stone/15" : ""}`
          : "mb-6"
      } ${className}`}
      data-entity-section
      data-section-key={config.key}
      data-section-surface={surface}
    >
      {isCollapsible ? (
        <div
          className={
            isPremium
              ? "flex w-full min-w-0 items-stretch border-b border-alloy-stone/15 bg-alloy-stone/[0.05]"
              : `flex w-full min-w-0 items-stretch rounded-t-md bg-alloy-stone/30 border-b border-admin-border mb-3 text-xs font-semibold tracking-wider text-alloy-forge`
          }
        >
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className={`entity-drawer-section-toggle flex min-h-0 min-w-0 flex-1 items-center justify-between gap-2 text-left transition-colors duration-150 ${
              isPremium
                ? "border-0 bg-transparent px-2.5 py-1.5 text-[10px] font-semibold tracking-[0.1em] text-alloy-forge/80 hover:bg-alloy-stone/10"
                : "border-0 bg-transparent px-3 py-2 hover:bg-alloy-stone/25"
            }`}
            aria-expanded={expanded}
          >
            <span className="min-w-0 truncate">{config.title}</span>
            <span className="shrink-0 text-alloy-muted transition-opacity duration-150" aria-hidden>
              {expanded ? "−" : "+"}
            </span>
          </button>
          {headerRight ? (
            <div
              className={`flex shrink-0 items-center gap-2 self-center px-2.5 normal-case tracking-normal ${
                isPremium ? "py-1.5" : "py-2"
              }`}
            >
              {headerRight}
            </div>
          ) : null}
        </div>
      ) : (
        <div className={isPremium ? PREMIUM_HEADER_STATIC : SECTION_HEADER_CLASS}>
          <div className="flex items-center gap-2">
            <span className="truncate">{config.title}</span>
            {headerRight ? <span className="shrink-0 normal-case tracking-normal">{headerRight}</span> : null}
          </div>
        </div>
      )}
      {showContent && (
        <div
          className={
            blockContent
              ? isPremium
                  ? "min-w-0 w-full px-2.5 pb-2 pt-1.5"
                  : `min-w-0 w-full ${isCollapsible ? "mt-2" : "mt-3"}`
              : isPremium
                ? `min-w-0 w-full px-2.5 pb-2 pt-1.5 grid gap-x-3 gap-y-1.5 ${gridCols} [&>*]:min-w-0`
                : `grid gap-x-4 gap-y-2 ${gridCols} ${isCollapsible ? "mt-2" : "mt-3"}`
          }
        >
          {children}
        </div>
      )}
    </section>
  );
}
