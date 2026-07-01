"use client";

import type { ReactNode } from "react";
import { MessageSquare, Settings2 } from "lucide-react";

import CommsModalTabBar from "@/app/adminV2/communications/CommsModalTabBar";
import CommunicationsWorkspaceKpiStrip from "@/app/adminV2/communications/CommunicationsWorkspaceKpiStrip";
import AlloyModeSwitch from "@/components/workspace/AlloyModeSwitch";
import OperationalModalHeader from "@/app/adminV2/components/OperationalModalHeader";
import {
    COMMS_PRIMARY_BTN_CLASS,
    COMMS_SECONDARY_BTN_CLASS,
    COMMS_WORKSPACE_EXECUTION_CLASS,
    COMMS_WORKSPACE_NAV_CLASS,
} from "@/app/adminV2/communications/commsWorkspaceUi";
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
 * Stable Communications workspace chrome — header, KPI reserve, navigation, execution surface.
 * Tab execution bodies mount inside the execution region only.
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
        <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-alloy-stone/20 bg-white"
            data-comms-workspace-shell="true"
            data-comms-modal-version="workspace-inc2c"
        >
            <OperationalModalHeader
                icon={<MessageSquare className="h-4 w-4" aria-hidden strokeWidth={2} />}
                title="Communications"
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

            <CommunicationsWorkspaceKpiStrip activeTab={activeTab} />

            <nav className={COMMS_WORKSPACE_NAV_CLASS} data-comms-workspace-nav="true" aria-label="Communications views">
                {/* Primary level — Work / Studio mode. */}
                <AlloyModeSwitch
                    modes={COMMUNICATIONS_MODES}
                    active={mode}
                    onChange={onModeChange}
                    ariaLabel="Communications mode"
                />
                {/* Child level — sections inside the active mode (subordinate to the mode).
                    Underline tab strip sitting on a hairline baseline so it reads as attached
                    to the mode context, not floating pills. */}
                <div
                    className="mt-1.5 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-alloy-stone/15"
                    data-comms-mode-sections="true"
                >
                    <CommsModalTabBar
                        tabs={modeTabs}
                        activeKey={activeTab}
                        onSelect={onTabChange}
                        aria-label={mode === "studio" ? "Studio sections" : "Work sections"}
                    />
                    {mode === "studio" ? (
                        <a
                            href="/settings/communications"
                            className={`${COMMS_SECONDARY_BTN_CLASS} mb-1.5 inline-flex items-center gap-1.5 !px-2.5 !py-1 text-[11px]`}
                            data-comms-studio-settings-link="true"
                        >
                            <Settings2 className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
                            Channels, signatures &amp; rules
                        </a>
                    ) : null}
                </div>
            </nav>

            <div className={COMMS_WORKSPACE_EXECUTION_CLASS} data-comms-workspace-execution="true">
                {children}
            </div>
        </div>
    );
}
