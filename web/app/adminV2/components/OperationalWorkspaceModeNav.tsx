"use client";

import type { ReactNode } from "react";

import { COMMS_WORKSPACE_NAV_CLASS } from "@/app/adminV2/communications/commsWorkspaceUi";
import {
    WorkspaceDivider,
    WorkspaceModeTabs,
    WorkspaceSubTabs,
} from "@/components/workspace/operational";
import type { AlloyModeOption } from "@/components/workspace/AlloyModeSwitch";

/**
 * Two-level operational workspace navigation — shared by Communications and Digital Mailroom.
 * Composes doctrine primitives: WorkspaceModeTabs + WorkspaceSubTabs.
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
    subTabDataAttr,
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
    /** Passed to WorkspaceSubTabs for legacy data-* tab attributes (e.g. comms). */
    subTabDataAttr?: string;
}) {
    return (
        <nav
            className={COMMS_WORKSPACE_NAV_CLASS}
            data-operational-workspace-nav={navDataAttr ?? "true"}
            aria-label={modeAriaLabel}
        >
            <WorkspaceModeTabs
                modes={modes}
                activeMode={activeMode}
                onModeChange={onModeChange}
                ariaLabel={modeAriaLabel}
            />
            <div
                className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 pt-2 pb-0"
                data-workspace-mode-sections={sectionsDataAttr ?? "true"}
            >
                <WorkspaceSubTabs
                    tabs={sectionTabs}
                    activeKey={activeSection}
                    onSelect={onSectionChange}
                    ariaLabel={sectionAriaLabel}
                    dataAttr={subTabDataAttr}
                />
                {sectionTrailing}
            </div>
            <WorkspaceDivider className="mt-0 border-stone-200" />
        </nav>
    );
}
