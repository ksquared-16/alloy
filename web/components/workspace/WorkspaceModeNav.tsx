"use client";

import type { ReactNode } from "react";

import WorkspaceModeTabs, { type WorkspaceMode } from "@/components/workspace/WorkspaceModeTabs";
import WorkspaceSubTabs from "@/components/workspace/WorkspaceSubTabs";
import { WS_SHELL_NAV_CLASS } from "@/components/workspace/workspaceTokens";

/**
 * @module WorkspaceModeNav
 *
 * Two-level navigation for every operational module modal workspace: primary mode tabs
 * (Work | Studio) and sub-section tabs (Overview | Queue, Inbox | Templates, …).
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
    showModeRail = true,
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
    /** Right column — operational health aligned with Work navigation (Processing reference). */
    metricsColumn?: ReactNode;
    navDataAttr?: string;
    sectionsDataAttr?: string;
    /**
     * Render the Work | Studio rail. Default true — every existing caller keeps
     * exactly the chrome it had. Modules with a single mode may opt out.
     */
    showModeRail?: boolean;
}) {
    /**
     * A module with one mode has no mode CHOICE, and a lone pill reads as a broken
     * switch. Roster only runs; Assignments needs Work | Studio because it both
     * runs and configures.
     *
     * OPT-IN, not inferred from `modes.length`. Work Items also declares exactly
     * one mode, so inferring would have silently changed a module this sprint has
     * no business changing — its own doctrine drift (the shell doc says Work Items
     * "omits the Work/Studio switch") is a real question, but a separate one.
     */
    const showModes = showModeRail;

    if (metricsColumn) {
        return (
            <nav
                className={WS_SHELL_NAV_CLASS}
                data-workspace-mode-nav={navDataAttr ?? "true"}
                aria-label={modeAriaLabel}
            >
                <div
                    className="grid grid-cols-1 items-center gap-y-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-x-4"
                    data-workspace-mode-split-nav="true"
                >
                    <div className="flex min-w-0 flex-col gap-2" data-workspace-mode-nav-stack="true">
                        {showModes ? (
                            <div data-workspace-mode-rail="true">
                                <WorkspaceModeTabs modes={modes} active={activeMode} onChange={onModeChange} ariaLabel={modeAriaLabel} />
                            </div>
                        ) : null}
                        <div data-workspace-mode-sections={sectionsDataAttr ?? "true"}>
                            <WorkspaceSubTabs
                                tabs={sectionTabs}
                                activeKey={activeSection}
                                onSelect={onSectionChange}
                                aria-label={sectionAriaLabel}
                            />
                        </div>
                    </div>
                    <div
                        className="flex min-w-0 flex-col justify-center lg:pl-2"
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
            className={WS_SHELL_NAV_CLASS}
            data-workspace-mode-nav={navDataAttr ?? "true"}
            aria-label={modeAriaLabel}
        >
            <div className="flex flex-col gap-2">
                {showModes ? (
                    <div data-workspace-mode-rail="true">
                        <WorkspaceModeTabs modes={modes} active={activeMode} onChange={onModeChange} ariaLabel={modeAriaLabel} />
                    </div>
                ) : null}
                <div
                    className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1"
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
            </div>
        </nav>
    );
}
