"use client";

import CommandCenterShell from "@/app/adminV2/communications/CommandCenterShell";
import TemplatesWorkspace from "@/app/adminV2/communications/TemplatesWorkspace";
import AnnouncementsWorkspace from "@/app/adminV2/communications/AnnouncementsWorkspace";
import CommunicationsOverviewLanding from "@/app/adminV2/communications/CommunicationsOverviewLanding";
import ScheduledWorkspace from "@/app/adminV2/communications/ScheduledWorkspace";
import ChannelsWorkspace from "@/app/adminV2/communications/ChannelsWorkspace";
import RulesWorkspace from "@/app/adminV2/communications/RulesWorkspace";

/** Primary operator tabs inside the Communications modal (gated only by comms_v2_command_center). */
export type CommunicationsModalTab =
    | "overview"
    | "inbox"
    | "announcements"
    | "scheduled"
    | "templates"
    | "channels"
    | "rules";

export const COMMUNICATIONS_WORK_TABS: { key: CommunicationsModalTab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "inbox", label: "Inbox" },
    { key: "announcements", label: "Announcements" },
    { key: "scheduled", label: "Scheduled" },
];

export const COMMUNICATIONS_STUDIO_TABS: { key: CommunicationsModalTab; label: string }[] = [
    { key: "templates", label: "Templates" },
    { key: "channels", label: "Channels" },
    { key: "rules", label: "Rules" },
];

/** Flat tab list for shell consumers that need every section label. */
export const COMMUNICATIONS_MODAL_TABS: { key: CommunicationsModalTab; label: string }[] = [
    ...COMMUNICATIONS_WORK_TABS,
    ...COMMUNICATIONS_STUDIO_TABS,
];

/**
 * Work / Studio mode layer (parity with Digital Mailroom). Mode organizes existing domain
 * concepts - it does not remove them:
 *   - Work   -> Overview, Inbox, Announcements, Scheduled
 *   - Studio -> Templates, Channels, Rules
 */
export type CommunicationsMode = "work" | "studio";

export const COMMUNICATIONS_MODES: { key: CommunicationsMode; label: string }[] = [
    { key: "work", label: "Work" },
    { key: "studio", label: "Studio" },
];

export const COMMUNICATIONS_TAB_MODE: Record<CommunicationsModalTab, CommunicationsMode> = {
    overview: "work",
    inbox: "work",
    announcements: "work",
    scheduled: "work",
    templates: "studio",
    channels: "studio",
    rules: "studio",
};

/** First tab shown when entering a mode. */
export function defaultCommunicationsTabForMode(mode: CommunicationsMode): CommunicationsModalTab {
    return mode === "studio" ? "templates" : "overview";
}

function tabPanelClass(active: boolean): string {
    return active
        ? "flex min-h-0 flex-1 flex-col overflow-hidden"
        : "pointer-events-none absolute inset-0 flex min-h-0 flex-1 flex-col overflow-hidden opacity-0";
}

/** Keep all workspaces mounted while the modal is open so tab switches feel instant. */
export default function CommunicationsModalTabPanel({
    tab,
    onNavigateTab,
    onComposeNew,
}: {
    tab: CommunicationsModalTab;
    onNavigateTab: (tab: CommunicationsModalTab) => void;
    onComposeNew?: () => void;
}) {
    const useExecutionFrame = tab !== "overview" && tab !== "channels" && tab !== "rules";

    return (
        <div
            data-comms-modal-body="true"
            className={
                useExecutionFrame
                    ? "relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-alloy-stone/20 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
                    : "relative flex min-h-0 flex-1 flex-col overflow-hidden"
            }
            data-comms-workspace-execution-surface="true"
        >
            <div
                className={tabPanelClass(tab === "overview")}
                data-comms-tab-panel="overview"
                aria-hidden={tab !== "overview"}
            >
                <CommunicationsOverviewLanding onNavigateTab={onNavigateTab} onComposeNew={onComposeNew} />
            </div>
            <div className={tabPanelClass(tab === "inbox")} data-comms-tab-panel="inbox" aria-hidden={tab !== "inbox"}>
                <CommandCenterShell />
            </div>
            <div
                className={tabPanelClass(tab === "templates")}
                data-comms-tab-panel="templates"
                aria-hidden={tab !== "templates"}
            >
                <TemplatesWorkspace />
            </div>
            <div
                className={tabPanelClass(tab === "announcements")}
                data-comms-tab-panel="announcements"
                aria-hidden={tab !== "announcements"}
            >
                <AnnouncementsWorkspace />
            </div>
            <div
                className={tabPanelClass(tab === "scheduled")}
                data-comms-tab-panel="scheduled"
                aria-hidden={tab !== "scheduled"}
            >
                <ScheduledWorkspace />
            </div>
            <div
                className={tabPanelClass(tab === "channels")}
                data-comms-tab-panel="channels"
                aria-hidden={tab !== "channels"}
            >
                <ChannelsWorkspace />
            </div>
            <div
                className={tabPanelClass(tab === "rules")}
                data-comms-tab-panel="rules"
                aria-hidden={tab !== "rules"}
            >
                <RulesWorkspace />
            </div>
        </div>
    );
}
