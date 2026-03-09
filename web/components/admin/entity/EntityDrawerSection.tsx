"use client";

import { ReactNode, useState } from "react";
import type { EntityDrawerSectionConfig } from "@/lib/entityPresentation";

const SECTION_HEADER_CLASS =
  "text-xs font-semibold uppercase tracking-wider text-alloy-muted border-b border-admin-border pb-2 mb-4";

interface EntityDrawerSectionProps {
  config: EntityDrawerSectionConfig;
  children: ReactNode;
  /** Override default expanded state (e.g. from persisted layout). */
  defaultExpanded?: boolean;
  className?: string;
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
}: EntityDrawerSectionProps) {
  const isCollapsible = config.collapsible ?? false;
  const [expanded, setExpanded] = useState(defaultExpanded ?? config.defaultExpanded ?? true);
  const showContent = !isCollapsible || expanded;
  const gridCols = config.gridCols === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1";

  return (
    <section
      className={`mb-6 ${className}`}
      data-entity-section
      data-section-key={config.key}
    >
      {isCollapsible ? (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className={`flex w-full items-center justify-between gap-2 text-left ${SECTION_HEADER_CLASS}`}
          aria-expanded={expanded}
        >
          <span>{config.title}</span>
          <span className="text-alloy-muted" aria-hidden>
            {expanded ? "−" : "+"}
          </span>
        </button>
      ) : (
        <h3 className={SECTION_HEADER_CLASS}>{config.title}</h3>
      )}
      {showContent && (
        <div className={`grid gap-x-6 gap-y-1 ${gridCols} ${isCollapsible ? "mt-2" : ""}`}>{children}</div>
      )}
    </section>
  );
}
