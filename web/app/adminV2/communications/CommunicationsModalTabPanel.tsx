"use client";

import CommandCenterShell from "@/app/adminV2/communications/CommandCenterShell";
import TemplatesWorkspace from "@/app/adminV2/communications/TemplatesWorkspace";
import AnnouncementsWorkspace from "@/app/adminV2/communications/AnnouncementsWorkspace";

/** Primary operator tabs inside the Inbox / Command Center modal (gated only by comms_v2_command_center). */
export type CommunicationsModalTab = "inbox" | "templates" | "announcements";

export const COMMUNICATIONS_MODAL_TABS: { key: CommunicationsModalTab; label: string }[] = [
    { key: "inbox", label: "Inbox" },
    { key: "templates", label: "Templates" },
    { key: "announcements", label: "Announcements" },
];

/**
 * Work / Studio mode layer (parity with Processing). Mode organizes the existing domain
 * concepts — it does not remove them:
 *   • Work   → live operational work: Inbox, Announcements.
 *   • Studio → reusable assets + setup: Templates (channel/signature/rules config still
 *              lives in Settings → Communications; Studio links there for now).
 */
export type CommunicationsMode = "work" | "studio";

export const COMMUNICATIONS_MODES: { key: CommunicationsMode; label: string }[] = [
    { key: "work", label: "Work" },
    { key: "studio", label: "Studio" },
];

export const COMMUNICATIONS_TAB_MODE: Record<CommunicationsModalTab, CommunicationsMode> = {
    inbox: "work",
    announcements: "work",
    templates: "studio",
};

/** First tab shown when entering a mode. */
export function defaultCommunicationsTabForMode(mode: CommunicationsMode): CommunicationsModalTab {
    return mode === "studio" ? "templates" : "inbox";
}

function tabPanelClass(active: boolean): string {
    return active
        ? "flex min-h-0 flex-1 flex-col overflow-hidden"
        : "pointer-events-none absolute inset-0 flex min-h-0 flex-1 flex-col overflow-hidden opacity-0";
}

/** Keep all workspaces mounted while the modal is open so tab switches feel instant. */
export default function CommunicationsModalTabPanel({ tab }: { tab: CommunicationsModalTab }) {
    return (
        <div
            data-comms-modal-body="true"
            className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-alloy-stone/20 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
            data-comms-workspace-execution-surface="true"
        >
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
        </div>
    );
}
