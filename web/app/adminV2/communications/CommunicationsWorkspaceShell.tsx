"use client";

import type { ReactNode } from "react";
import { MessageSquare } from "lucide-react";

import CommunicationsWorkspaceKpiStrip from "@/app/adminV2/communications/CommunicationsWorkspaceKpiStrip";
import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import { COMMS_PRIMARY_BTN_CLASS, COMMS_WORKSPACE_EXECUTION_CLASS } from "@/app/adminV2/communications/commsWorkspaceUi";
import {
    COMMUNICATIONS_MODES,
    COMMUNICATIONS_TAB_MODE,
    type CommunicationsMode,
    type CommunicationsModalTab,
} from "@/app/adminV2/communications/CommunicationsModalTabPanel";

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
 * Communications operational workspace — composes canonical WorkspaceShell + WorkspaceMetricTiles.
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
        <WorkspaceShell
            dataTestId="communications-workspace-shell"
            shellDataAttrs={{
                "data-comms-workspace-shell": true,
                "data-comms-modal-version": "workspace-v2",
            }}
            header={{
                icon: <MessageSquare className="h-4 w-4" aria-hidden strokeWidth={2} />,
                title: "Communications",
                subtitle: "Where conversations happen.",
                titleId: "adminv2-inbox-modal-title",
                onClose,
                closeLabel: "Close communications",
                actions:
                    showComposeNew && onComposeNew ? (
                        <button
                            type="button"
                            data-inbox-compose-new="true"
                            onClick={onComposeNew}
                            className={COMMS_PRIMARY_BTN_CLASS}
                        >
                            Compose New
                        </button>
                    ) : null,
            }}
            modes={COMMUNICATIONS_MODES}
            activeMode={mode}
            onModeChange={onModeChange}
            modeAriaLabel="Communications mode"
            sectionTabs={modeTabs}
            activeSection={activeTab}
            onSectionChange={onTabChange}
            sectionAriaLabel={mode === "studio" ? "Studio sections" : "Work sections"}
            metricsColumn={activeTab !== "overview" ? <CommunicationsWorkspaceKpiStrip activeTab={activeTab} /> : undefined}
            navDataAttr="comms"
            sectionsDataAttr="comms"
        >
            <div className={`${COMMS_WORKSPACE_EXECUTION_CLASS} !min-h-0 !p-0`} data-comms-workspace-execution="true">
                {children}
            </div>
        </WorkspaceShell>
    );
}
