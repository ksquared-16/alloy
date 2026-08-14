"use client";

import type { ReactNode } from "react";

import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import WorkspaceModeNav from "@/components/workspace/WorkspaceModeNav";
import type { WorkspaceMode } from "@/components/workspace/WorkspaceModeTabs";
import WorkspaceExpandControl from "@/components/workspace/WorkspaceExpandControl";
import { useWorkspaceExpand } from "@/components/workspace/WorkspaceExpandContext";
import { WS_CONTROL_BAND_DIVIDER, WS_FIELD_CANVAS, WS_SHELL_INSET } from "@/components/workspace/workspaceTokens";

/**
 * @module WorkspaceShell
 *
 * ## Purpose
 * The invariant chrome for every operational module modal (Processing, Communications,
 * Work Items, Scheduling, Attendance, Billing, Reporting). Owns the fixed hierarchy so
 * modules only supply content.
 *
 * ## Layer model (Operational Workspace Doctrine V2)
 * 1. White modal shell — header + nav
 * 2. Inset stone workspace field (~16px gutter, ~7% stone canvas)
 * 3. White contained surfaces (cards, zones, queues) — module children
 * 4. Interactive objects — buttons, rows, selections
 *
 * ## When to use
 * Any AdminV2 modal workspace that follows Work | Studio + module sub-tabs. Processing,
 * Communications, and Work Items are certified implementations.
 *
 * ## Do NOT use for
 * - `/workspace` org landing (Presentation Runtime `WorkspaceRootShell`).
 * - Entity drawers / Focus Panel record surfaces.
 * - Settings or configuration pages outside the operational modal pattern.
 *
 * ## Required structure (never deviate)
 * ```
 * WorkspaceHeader     — module title + tagline + actions + close
 * [optional kpiBand]  — full-width status strip (legacy; prefer metricsColumn)
 * WorkspaceModeNav    — Work | Studio + module tabs [+ optional metricsColumn]
 * Inset stone field   — operational canvas (owned here, not tinted full modal)
 *   └ module content  — WorkspaceSurface / WorkspaceCard / WorkspaceZonePanel
 * ```
 */

export type WorkspaceShellHeader = {
    icon: ReactNode;
    title: string;
    titleId: string;
    subtitle?: string;
    actions?: ReactNode;
    secondaryActions?: ReactNode;
    onClose: () => void;
    closeLabel?: string;
};

export default function WorkspaceShell<M extends string, S extends string>({
    header,
    modes,
    activeMode,
    onModeChange,
    modeAriaLabel,
    sectionTabs,
    activeSection,
    onSectionChange,
    sectionAriaLabel,
    kpiBand,
    metricsColumn,
    sectionTrailing,
    navDataAttr,
    sectionsDataAttr,
    bodyClassName,
    dataTestId,
    shellDataAttrs,
    showModeRail,
    children,
}: {
    header: WorkspaceShellHeader;
    modes: ReadonlyArray<WorkspaceMode<M>>;
    activeMode: M;
    onModeChange: (mode: M) => void;
    modeAriaLabel: string;
    sectionTabs: { key: S; label: string }[];
    activeSection: S;
    onSectionChange: (key: S) => void;
    sectionAriaLabel: string;
    kpiBand?: ReactNode;
    metricsColumn?: ReactNode;
    sectionTrailing?: ReactNode;
    navDataAttr?: string;
    sectionsDataAttr?: string;
    /** Override inner stone canvas classes (rare — prefer default WS_FIELD_CANVAS). */
    bodyClassName?: string;
    dataTestId?: string;
    /** Extra data-* attributes on the root shell element (module certification markers). */
    shellDataAttrs?: Record<string, string | boolean>;
    /** Render the Work | Studio rail. Default true; single-mode modules may opt out. */
    showModeRail?: boolean;
    children: ReactNode;
}) {
    const { expanded } = useWorkspaceExpand();
    const secondaryWithExpand = (
        <>
            {header.secondaryActions}
            <WorkspaceExpandControl />
        </>
    );

    return (
        <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-alloy-stone/20 bg-white"
            data-workspace-shell="true"
            data-workspace-expanded={expanded ? "true" : "false"}
            data-testid={dataTestId}
            {...shellDataAttrs}
        >
            <div className={`shrink-0 ${WS_CONTROL_BAND_DIVIDER}`} data-workspace-control-band="true">
                <WorkspaceHeader
                    icon={header.icon}
                    title={header.title}
                    subtitle={header.subtitle}
                    titleId={header.titleId}
                    actions={header.actions}
                    secondaryActions={secondaryWithExpand}
                    onClose={header.onClose}
                    closeLabel={header.closeLabel}
                />

                {kpiBand}

                <WorkspaceModeNav
                    modes={modes}
                    activeMode={activeMode}
                    onModeChange={onModeChange}
                    modeAriaLabel={modeAriaLabel}
                    sectionTabs={sectionTabs}
                    activeSection={activeSection}
                    onSectionChange={onSectionChange}
                    sectionAriaLabel={sectionAriaLabel}
                    metricsColumn={metricsColumn}
                    showModeRail={showModeRail}
                    sectionTrailing={sectionTrailing}
                    navDataAttr={navDataAttr}
                    sectionsDataAttr={sectionsDataAttr}
                />
            </div>

            <div className={WS_SHELL_INSET} data-workspace-shell-inset="true">
                <div
                    className={bodyClassName ?? WS_FIELD_CANVAS}
                    data-workspace-shell-body="true"
                >
                    {children}
                </div>
            </div>
        </div>
    );
}
