"use client";

import { useEffect, useState } from "react";
import { MessageSquare, X } from "lucide-react";

import AdminV2WorkspaceBosModalShell from "@/app/adminV2/components/AdminV2WorkspaceBosModalShell";
import InboxPanel from "@/app/adminV2/messages/InboxPanel";
import CommunicationsModalTabPanel, {
    COMMUNICATIONS_MODAL_TABS,
    type CommunicationsModalTab,
} from "@/app/adminV2/communications/CommunicationsModalTabPanel";
import CommsModalTabBar from "@/app/adminV2/communications/CommsModalTabBar";
import QuickMessageModal from "@/app/adminV2/components/QuickMessageModal";
import { COMMS_SECONDARY_BTN_CLASS, COMMS_PRIMARY_BTN_CLASS } from "@/app/adminV2/communications/commsWorkspaceUi";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";

export type InboxModalProps = {
    open: boolean;
    onClose: () => void;
};

export default function InboxModal({ open, onClose }: InboxModalProps) {
    const [composeOpen, setComposeOpen] = useState(false);
    const [tab, setTab] = useState<CommunicationsModalTab>("inbox");
    const commandCenterEnabled = isCommsV2FlagEnabled("comms_v2_command_center");

    useEffect(() => {
        if (!open) {
            setComposeOpen(false);
            setTab("inbox");
        }
    }, [open]);

    const showComposeNew = commandCenterEnabled ? tab === "inbox" : !commandCenterEnabled;

    return (
        <AdminV2WorkspaceBosModalShell
            open={open}
            onClose={onClose}
            dataModalAttr="adminv2-inbox-modal"
            ariaLabelledBy="adminv2-inbox-modal-title"
            panelClassName="max-h-[min(88vh,44rem)]"
        >
            <div
                className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-alloy-stone/20 bg-[#f3f5f7]"
                data-adminv2-inbox-modal="true"
            >
                <div className="flex shrink-0 flex-col gap-3 border-b border-alloy-stone/15 bg-white px-4 py-3 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                                <MessageSquare className="h-4 w-4 shrink-0 text-alloy-midnight/65" aria-hidden strokeWidth={2} />
                                <h2 id="adminv2-inbox-modal-title" className="text-sm font-semibold text-alloy-midnight">
                                    Communications
                                </h2>
                            </div>
                            {commandCenterEnabled ?
                                <CommsModalTabBar tabs={COMMUNICATIONS_MODAL_TABS} activeKey={tab} onSelect={setTab} />
                            :   null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                            {showComposeNew ?
                                <button
                                    type="button"
                                    data-inbox-compose-new="true"
                                    onClick={() => setComposeOpen(true)}
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
                </div>
                <div className="flex min-h-[min(22rem,65vh)] flex-1 flex-col overflow-hidden p-3">
                    {commandCenterEnabled ?
                        <CommunicationsModalTabPanel tab={tab} />
                    :   <InboxPanel
                            layout="modal"
                            onClose={onClose}
                            composeOpen={composeOpen}
                            onComposeOpenChange={setComposeOpen}
                        />
                    }
                </div>
            </div>
            {commandCenterEnabled ?
                <QuickMessageModal open={composeOpen} onClose={() => setComposeOpen(false)} />
            :   null}
        </AdminV2WorkspaceBosModalShell>
    );
}
