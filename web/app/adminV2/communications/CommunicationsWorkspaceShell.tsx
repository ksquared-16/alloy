"use client";

import type { ReactNode } from "react";
import { MessageSquare } from "lucide-react";

import CommunicationsWorkspaceKpiStrip from "@/app/adminV2/communications/CommunicationsWorkspaceKpiStrip";
import OperationalWorkspaceModeNav from "@/app/adminV2/components/OperationalWorkspaceModeNav";
import { COMMS_PRIMARY_BTN_CLASS } from "@/app/adminV2/communications/commsWorkspaceUi";
import {
    COMMUNICATIONS_MODES,
    COMMUNICATIONS_TAB_MODE,
    type CommunicationsMode,
    type CommunicationsModalTab,
} from "@/app/adminV2/communications/CommunicationsModalTabPanel";
import {
    WorkspaceHeader,
    WorkspaceShell,
    WorkspaceSurface,
} from "@/components/workspace/operational";

type TabDef = { key: CommunicationsModalTab; label: string };

export type CommunicationsWorkspaceShellProps = {
    tabs: TabDef[];
    activeTab: CommunicationsModalTab;
    onTabChange: (tab: CommunicationsModalTab) => void;
    mode: CommunicationsMode;
    onModeChange: (mode: CommunicationsMode) => void;
    onClose: () => void;
    onComposeNew?: () => void;
    showComposeNew?: boolean;
    children: ReactNode;
};

/**
 * Communications workspace — consumes Operational Workspace Doctrine V2 primitives only.
 * Tab execution bodies mount inside WorkspaceSurface; no Communications-specific shell chrome.
 */
export default function CommunicationsWorkspaceShell({
    tabs,
    activeTab,
    onTabChange,
    mode,
    onModeChange,
    onClose,
    onComposeNew,
    showComposeNew = false,
    children,
}: CommunicationsWorkspaceShellProps) {
    const modeTabs = tabs.filter((t) => COMMUNICATIONS_TAB_MODE[t.key] === mode);

    return (
        <WorkspaceShell dataModule="comms" version="doctrine-v2">
            <WorkspaceHeader
                icon={<MessageSquare className="h-4 w-4" aria-hidden strokeWidth={2} />}
                title="Communications"
                subtitle="Where conversations happen."
                titleId="adminv2-inbox-modal-title"
                onClose={onClose}
                closeLabel="Close communications"
                actions={
                    showComposeNew && onComposeNew ? (
                        <button
                            type="button"
                            data-inbox-compose-new="true"
                            onClick={onComposeNew}
                            className={COMMS_PRIMARY_BTN_CLASS}
                        >
                            Compose New
                        </button>
                    ) : null
                }
            />

            {activeTab !== "overview" ? <CommunicationsWorkspaceKpiStrip activeTab={activeTab} /> : null}

            <OperationalWorkspaceModeNav
                modes={COMMUNICATIONS_MODES}
                activeMode={mode}
                onModeChange={onModeChange}
                modeAriaLabel="Communications mode"
                sectionTabs={modeTabs}
                activeSection={activeTab}
                onSectionChange={onTabChange}
                sectionAriaLabel={mode === "studio" ? "Studio sections" : "Work sections"}
                navDataAttr="comms"
                sectionsDataAttr="comms"
                subTabDataAttr="comms"
            />

            <WorkspaceSurface variant="execution" className="!min-h-0 !border-t-0 !bg-white !p-0" data-comms-workspace-execution="true">
                {children}
            </WorkspaceSurface>
        </WorkspaceShell>
    );
}
