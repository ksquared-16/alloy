"use client";

import { useState } from "react";

import CommunicationsDrawerSection from "@/components/admin/communications/CommunicationsDrawerSection";
import OpportunityDrawerVmTabPanes from "@/components/admin/vmDrawer/OpportunityDrawerVmTabPanes";
import {
    ACTIVITY_WORKSPACE_TABS,
    DEFAULT_ACTIVITY_WORKSPACE_TAB,
    type ActivityWorkspaceTabKey,
} from "@/lib/adminV2/runtime/focusPanel/activityWorkspaceTabs";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { DrawerTabKey } from "@/lib/entityPresentation";

type Props = {
    drawerId: string;
    record: Record<string, unknown>;
    displayVm: OpportunityDrawerViewModel;
    onSelectTab: (tab: DrawerTabKey) => void;
    initialTab?: ActivityWorkspaceTabKey;
};

function drawerTabForActivityWorkspaceTab(key: ActivityWorkspaceTabKey): DrawerTabKey {
    switch (key) {
        case "documents":
            return "documents";
        case "notes":
            return "notes";
        case "communications":
            return "communications";
        default:
            return "activity";
    }
}

/** System 5A Activity — horizontal historical workspace with embedded comms drill. */
export default function OpportunityFocusPanelActivityWorkspace({
    drawerId,
    record,
    displayVm,
    onSelectTab,
    initialTab = DEFAULT_ACTIVITY_WORKSPACE_TAB,
}: Props) {
    const [activeTab, setActiveTab] = useState<ActivityWorkspaceTabKey>(initialTab);

    const commsInsight = (() => {
        const reminders = displayVm.summaries.reminders;
        const scheduledCount = reminders?.scheduled_send_count ?? 0;
        if (scheduledCount > 0) {
            return `${scheduledCount} scheduled send${scheduledCount === 1 ? "" : "s"} · open thread for history`;
        }
        if (reminders?.next_follow_up_iso) {
            return `Follow-up due ${String(reminders.next_follow_up_iso).slice(0, 10)} · open thread for history`;
        }
        return "No recent outreach logged · open thread for full history";
    })();

    return (
        <div
            className="alloy-os-activity-workspace"
            data-focus-panel-activity-workspace="true"
            data-focus-panel-mode="activity"
            role="tabpanel"
            aria-labelledby="focus-panel-mode-tab-activity"
        >
            <div
                className="alloy-os-activity-workspace__nav"
                role="tablist"
                aria-label="Activity sections"
                data-activity-workspace-nav="true"
            >
                {ACTIVITY_WORKSPACE_TABS.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        id={`activity-workspace-tab-${tab.key}`}
                        aria-selected={activeTab === tab.key}
                        aria-controls={`activity-workspace-panel-${tab.key}`}
                        className={
                            activeTab === tab.key
                                ? "alloy-os-activity-workspace__tab alloy-os-activity-workspace__tab--active"
                                : "alloy-os-activity-workspace__tab"
                        }
                        data-activity-workspace-tab={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            <div
                className="alloy-os-activity-workspace__panel"
                data-activity-workspace-panel={activeTab}
                role="tabpanel"
                id={`activity-workspace-panel-${activeTab}`}
                aria-labelledby={`activity-workspace-tab-${activeTab}`}
            >
                {activeTab === "communications" ?
                    <>
                        <div
                            className="alloy-os-activity-workspace__comms-summary"
                            data-activity-comms-summary="true"
                        >
                            <span className="alloy-os-activity-workspace__comms-summary-label">Communications</span>
                            <span className="alloy-os-activity-workspace__comms-summary-insight">{commsInsight}</span>
                            <button
                                type="button"
                                className="alloy-os-activity-workspace__comms-open"
                                onClick={() => onSelectTab("communications")}
                            >
                                Open thread →
                            </button>
                        </div>
                        <div
                            className="alloy-os-activity-workspace__embed"
                            data-embedded-workspace="communications"
                        >
                            <CommunicationsDrawerSection
                                apiEntityType="opportunities"
                                entityId={drawerId}
                                embedded
                                embeddedHeaderMode="description_only"
                            />
                        </div>
                    </>
                :   <div className="alloy-os-activity-workspace__embed" data-embedded-workspace={activeTab}>
                        <OpportunityDrawerVmTabPanes
                            drawerId={drawerId}
                            drawerTab={drawerTabForActivityWorkspaceTab(activeTab)}
                            record={record}
                            onSelectTab={onSelectTab}
                        />
                    </div>
                }
            </div>
        </div>
    );
}
