"use client";

import type { ReactNode } from "react";

import WorkspaceModeTabs, { type WorkspaceMode } from "@/components/workspace/WorkspaceModeTabs";
import WorkspaceSubTabs from "@/components/workspace/WorkspaceSubTabs";
import { WS_NAV_CONTENT_DIVIDER, WS_SHELL_NAV_CLASS } from "@/components/workspace/workspaceTokens";

/**
 * @module WorkspaceModeNav
 *
 * ## Purpose
 * Two-level navigation for every operational module modal workspace: primary mode tabs
 * (Work | Studio) and sub-section tabs (Overview | Queue, Inbox | Templates, …).
 *
 * ## When to use
 * Inside `WorkspaceShell` after `WorkspaceHeader`. Pass module-specific mode and section
 * tab definitions. Use `metricsColumn` when Work-mode KPI tiles share the nav band
 * (Processing reference pattern). Use `sectionTrailing` for inline controls on the
 * sub-tab row (Communications Studio settings link).
 *
 * ## Do NOT use for
 * - Org-level `/workspace` landing navigation (use Presentation Runtime surfaces).
 * - Record drawer / Focus Panel tab strips (use Experience Builder layout tabs).
 * - Replacing the sidebar or business-process spine.
 *
 * ## Required hierarchy (never deviate)
 * ```
 * Module title + tagline   (WorkspaceHeader)
 * Work | Studio            (this component — mode rail)
 * Module tabs              (this component — section row)
 * ────────────────────────
 * Workspace body           (WorkspaceSurface + children)
 * ```
 */

export default function WorkspaceModeNav<M extends string, S extends string>({
    modes,
    activeMode,
    onModeChange,
    modeAriaLabel,
    sectionTabs,
    activeSection,
    onSectionChange,
    sectionAriaLabel,
    sectionTrailing,
    metricsColumn,
    navDataAttr,
    sectionsDataAttr,
}: {
    modes: ReadonlyArray<WorkspaceMode<M>>;
    activeMode: M;
    onModeChange: (mode: M) => void;
    modeAriaLabel: string;
    sectionTabs: { key: S; label: string }[];
    activeSection: S;
    onSectionChange: (key: S) => void;
    sectionAriaLabel: string;
    sectionTrailing?: ReactNode;
    /** Right 2/3 — spans both nav rows (module KPI band beside mode + section tabs). */
    metricsColumn?: ReactNode;
    navDataAttr?: string;
    sectionsDataAttr?: string;
}) {
    if (metricsColumn) {
        return (
            <nav
                className={`${WS_SHELL_NAV_CLASS} ${WS_NAV_CONTENT_DIVIDER}`}
                data-workspace-mode-nav={navDataAttr ?? "true"}
                aria-label={modeAriaLabel}
            >
                <div
                    className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:grid-rows-[auto_auto]"
                    data-workspace-mode-split-nav="true"
                >
                    <div
                        className="pb-2 lg:col-start-1 lg:row-start-1"
                        data-workspace-mode-rail="true"
                    >
                        <WorkspaceModeTabs modes={modes} active={activeMode} onChange={onModeChange} ariaLabel={modeAriaLabel} />
                    </div>
                    <div
                        className="pt-1.5 pb-0 lg:col-start-1 lg:row-start-2"
                        data-workspace-mode-sections={sectionsDataAttr ?? "true"}
                    >
                        <WorkspaceSubTabs
                            tabs={sectionTabs}
                            activeKey={activeSection}
                            onSelect={onSectionChange}
                            aria-label={sectionAriaLabel}
                        />
                    </div>
                    <div
                        className="flex min-w-0 items-center justify-start border-t border-alloy-stone/15 py-2 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:border-l lg:border-t-0 lg:pl-4 lg:py-0"
                        data-workspace-mode-metrics="true"
                    >
                        {metricsColumn}
                    </div>
                </div>
            </nav>
        );
    }

    return (
        <nav
            className={`${WS_SHELL_NAV_CLASS} ${WS_NAV_CONTENT_DIVIDER}`}
            data-workspace-mode-nav={navDataAttr ?? "true"}
            aria-label={modeAriaLabel}
        >
            <div className="pb-2" data-workspace-mode-rail="true">
                <WorkspaceModeTabs modes={modes} active={activeMode} onChange={onModeChange} ariaLabel={modeAriaLabel} />
            </div>
            <div
                className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 pt-1"
                data-workspace-mode-sections={sectionsDataAttr ?? "true"}
            >
                <WorkspaceSubTabs
                    tabs={sectionTabs}
                    activeKey={activeSection}
                    onSelect={onSectionChange}
                    aria-label={sectionAriaLabel}
                />
                {sectionTrailing}
            </div>
        </nav>
    );
}
