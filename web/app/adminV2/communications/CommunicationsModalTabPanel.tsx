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

export default function CommunicationsModalTabPanel({ tab }: { tab: CommunicationsModalTab }) {
    return (
        <div
            data-comms-modal-body="true"
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-alloy-stone/15 bg-white shadow-sm"
        >
            {tab === "inbox" ? <CommandCenterShell /> : null}
            {tab === "templates" ? <TemplatesWorkspace /> : null}
            {tab === "announcements" ? <AnnouncementsWorkspace /> : null}
        </div>
    );
}
