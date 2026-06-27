"use client";

import { useState } from "react";

import CommunicationsDrawerSection from "@/components/admin/communications/CommunicationsDrawerSection";
import OpportunityDrawerVmTabPanes from "@/components/admin/vmDrawer/OpportunityDrawerVmTabPanes";
import {
    DEFAULT_EMBEDDED_WORKSPACE_TAB,
    EMBEDDED_WORKSPACE_TABS,
    type EmbeddedWorkspaceTabKey,
} from "@/lib/adminV2/runtime/focusPanel/embeddedWorkspaceTabs";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { DrawerTabKey } from "@/lib/entityPresentation";
import { alloySectionDomAttrs } from "@/lib/perf/alloySectionMap";

type Props = {
    drawerId: string;
    record: Record<string, unknown>;
    displayVm: OpportunityDrawerViewModel;
    onSelectTab: (tab: DrawerTabKey) => void;
    initialTab?: EmbeddedWorkspaceTabKey;
};

function drawerTabForEmbeddedWorkspaceTab(key: EmbeddedWorkspaceTabKey): DrawerTabKey {
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

/** Activity mode — horizontal embedded workspace with comms drill and tab panes. */
export default function OpportunityFocusPanelEmbeddedWorkspace({
    drawerId,
    record,
    displayVm,
    onSelectTab,
    initialTab = DEFAULT_EMBEDDED_WORKSPACE_TAB,
}: Props) {
    const [activeTab, setActiveTab] = useState<EmbeddedWorkspaceTabKey>(initialTab);

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
            data-focus-panel-embedded-workspace="true"
            data-focus-panel-activity-workspace="true"
            data-focus-panel-mode="activity"
            role="tabpanel"
            aria-labelledby="focus-panel-mode-tab-activity"
            {...alloySectionDomAttrs("WU-11")}
        >
            <div
                className="alloy-os-activity-workspace__nav"
                role="tablist"
                aria-label="Embedded workspace sections"
                data-embedded-workspace-nav="true"
                data-activity-workspace-nav="true"
            >
                {EMBEDDED_WORKSPACE_TABS.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        id={`embedded-workspace-tab-${tab.key}`}
                        aria-selected={activeTab === tab.key}
                        aria-controls={`embedded-workspace-panel-${tab.key}`}
                        className={
                            activeTab === tab.key
                                ? "alloy-os-activity-workspace__tab alloy-os-activity-workspace__tab--active"
                                : "alloy-os-activity-workspace__tab"
                        }
                        data-embedded-workspace-tab={tab.key}
                        data-activity-workspace-tab={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            <div
                className="alloy-os-activity-workspace__panel"
                data-embedded-workspace-panel={activeTab}
                data-activity-workspace-panel={activeTab}
                role="tabpanel"
                id={`embedded-workspace-panel-${activeTab}`}
                aria-labelledby={`embedded-workspace-tab-${activeTab}`}
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
                            drawerTab={drawerTabForEmbeddedWorkspaceTab(activeTab)}
                            record={record}
                            onSelectTab={onSelectTab}
                        />
                    </div>
                }
            </div>
        </div>
    );
}
