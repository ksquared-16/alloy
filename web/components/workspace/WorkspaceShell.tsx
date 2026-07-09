"use client";

import type { ReactNode } from "react";

import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import WorkspaceModeNav from "@/components/workspace/WorkspaceModeNav";
import type { WorkspaceMode } from "@/components/workspace/WorkspaceModeTabs";
import { WS_FIELD } from "@/components/workspace/workspaceTokens";

/**
 * @module WorkspaceShell
 *
 * ## Purpose
 * The invariant chrome for every operational module modal (Processing, Communications,
 * Work Items, Scheduling, Attendance, Billing, Reporting). Owns the fixed hierarchy so
 * modules only supply content.
 *
 * ## When to use
 * Any AdminV2 modal workspace that follows Work | Studio + module sub-tabs. Processing
 * (Digital Mailroom) is the reference implementation.
 *
 * ## Do NOT use for
 * - `/workspace` org landing (Presentation Runtime `WorkspaceRootShell`).
 * - Entity drawers / Focus Panel record surfaces.
 * - Settings or configuration pages outside the operational modal pattern.
 *
 * ## Required structure (never deviate)
 * ```
 * WorkspaceHeader     — module title + tagline + actions + close
 * [optional kpiBand]  — full-width status strip (Communications)
 * WorkspaceModeNav    — Work | Studio + module tabs [+ optional metricsColumn]
 * Workspace body      — stone field; children use WorkspaceSurface / WorkspaceCard
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
    bodyClassName?: string;
    dataTestId?: string;
    children: ReactNode;
}) {
    return (
        <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-alloy-stone/20 bg-white"
            data-workspace-shell="true"
            data-testid={dataTestId}
        >
            <WorkspaceHeader
                icon={header.icon}
                title={header.title}
                subtitle={header.subtitle}
                titleId={header.titleId}
                actions={header.actions}
                secondaryActions={header.secondaryActions}
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
                sectionTrailing={sectionTrailing}
                navDataAttr={navDataAttr}
                sectionsDataAttr={sectionsDataAttr}
            />

            <div
                className={bodyClassName ?? `flex min-h-0 flex-1 flex-col overflow-hidden ${WS_FIELD}`}
                data-workspace-shell-body="true"
            >
                {children}
            </div>
        </div>
    );
}
