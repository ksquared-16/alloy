"use client";

import type { ReactNode } from "react";

import CommsModalTabBar from "@/app/adminV2/communications/CommsModalTabBar";
import { COMMS_WORKSPACE_NAV_CLASS } from "@/app/adminV2/communications/commsWorkspaceUi";
import AlloyModeSwitch, { type AlloyModeOption } from "@/components/workspace/AlloyModeSwitch";

/**
 * Two-level operational workspace navigation — shared by Communications and Digital Mailroom.
 *
 *   Work | Studio
 *   ─────────────────
 *   Overview | Queue
 *   ─────────────────
 *   Workspace
 */
export default function OperationalWorkspaceModeNav<M extends string, S extends string>({
    modes,
    activeMode,
    onModeChange,
    modeAriaLabel,
    sectionTabs,
    activeSection,
    onSectionChange,
    sectionAriaLabel,
    sectionTrailing,
    navDataAttr,
    sectionsDataAttr,
}: {
    modes: ReadonlyArray<AlloyModeOption<M>>;
    activeMode: M;
    onModeChange: (mode: M) => void;
    modeAriaLabel: string;
    sectionTabs: { key: S; label: string }[];
    activeSection: S;
    onSectionChange: (key: S) => void;
    sectionAriaLabel: string;
    sectionTrailing?: ReactNode;
    navDataAttr?: string;
    sectionsDataAttr?: string;
}) {
    return (
        <nav
            className={COMMS_WORKSPACE_NAV_CLASS}
            data-operational-workspace-nav={navDataAttr ?? "true"}
            aria-label={modeAriaLabel}
        >
            <div className="border-b border-alloy-stone/15 pb-2.5" data-workspace-mode-rail="true">
                <AlloyModeSwitch modes={modes} active={activeMode} onChange={onModeChange} ariaLabel={modeAriaLabel} />
            </div>
            <div
                className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-stone-200 pt-2 pb-0"
                data-workspace-mode-sections={sectionsDataAttr ?? "true"}
            >
                <CommsModalTabBar
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
