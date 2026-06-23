"use client";

import type { ReactNode } from "react";
import { MessageSquare, X } from "lucide-react";

import CommsModalTabBar from "@/app/adminV2/communications/CommsModalTabBar";
import {
    COMMS_PRIMARY_BTN_CLASS,
    COMMS_SECONDARY_BTN_CLASS,
    CommsWorkspaceKpiBand,
} from "@/app/adminV2/communications/commsWorkspaceUi";
import type { CommunicationsModalTab } from "@/app/adminV2/communications/CommunicationsModalTabPanel";

type TabDef = { key: CommunicationsModalTab; label: string };

export type CommunicationsWorkspaceShellProps = {
    tabs: TabDef[];
    activeTab: CommunicationsModalTab;
    onTabChange: (tab: CommunicationsModalTab) => void;
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
    onClose,
    onComposeNew,
    showComposeNew = false,
    children,
}: CommunicationsWorkspaceShellProps) {
    return (
        <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-alloy-stone/20 bg-white"
            data-comms-workspace-shell="true"
            data-comms-modal-version="workspace-inc1"
        >
            <header
                className="flex shrink-0 flex-col gap-2 border-b border-alloy-stone/15 bg-white px-4 py-3"
                data-comms-workspace-header="true"
            >
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <MessageSquare className="h-4 w-4 shrink-0 text-alloy-midnight/65" aria-hidden strokeWidth={2} />
                        <h2 id="adminv2-inbox-modal-title" className="text-sm font-semibold text-alloy-midnight">
                            Communications
                        </h2>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                        {showComposeNew && onComposeNew ?
                            <button
                                type="button"
                                data-inbox-compose-new="true"
                                onClick={onComposeNew}
                                className={COMMS_PRIMARY_BTN_CLASS}
                            >
                                Compose New
                            </button>
                        :   null}
                        <button
                            type="button"
                            onClick={onClose}
                            className={`${COMMS_SECONDARY_BTN_CLASS} inline-flex items-center gap-1 !px-2 !py-1 text-[11px]`}
                            aria-label="Close communications"
                        >
                            <X className="h-3.5 w-3.5" aria-hidden strokeWidth={2} />
                            Close
                        </button>
                    </div>
                </div>
            </header>

            <CommsWorkspaceKpiBand activeTab={activeTab} />

            <nav
                className="shrink-0 border-b border-alloy-stone/12 bg-white px-4 py-2"
                data-comms-workspace-nav="true"
                aria-label="Communications views"
            >
                <CommsModalTabBar tabs={tabs} activeKey={activeTab} onSelect={onTabChange} />
            </nav>

            <div
                className="flex min-h-[min(22rem,65vh)] flex-1 flex-col overflow-hidden bg-white p-3"
                data-comms-workspace-execution="true"
            >
                {children}
            </div>
        </div>
    );
}
