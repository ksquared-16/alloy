"use client";

import { useEffect, useState } from "react";

import AdminV2WorkspaceBosModalShell from "@/app/adminV2/components/AdminV2WorkspaceBosModalShell";
import InboxPanel from "@/app/adminV2/messages/InboxPanel";
import CommunicationsModalTabPanel, {
    COMMUNICATIONS_MODAL_TABS,
    type CommunicationsModalTab,
} from "@/app/adminV2/communications/CommunicationsModalTabPanel";
import CommunicationsWorkspaceShell from "@/app/adminV2/communications/CommunicationsWorkspaceShell";
import QuickMessageModal from "@/app/adminV2/components/QuickMessageModal";
import { warmCommunicationsWorkspaceModal } from "@/lib/communications/v2/communicationsWorkspaceWarmCache";
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

    useEffect(() => {
        if (!open || !commandCenterEnabled) return;
        void warmCommunicationsWorkspaceModal();
    }, [open, commandCenterEnabled]);

    const showComposeNew = commandCenterEnabled ? tab === "inbox" : !commandCenterEnabled;

    return (
        <AdminV2WorkspaceBosModalShell
            open={open}
            onClose={onClose}
            dataModalAttr="adminv2-inbox-modal"
            ariaLabelledBy="adminv2-inbox-modal-title"
            panelClassName="max-h-[min(88vh,44rem)]"
        >
            {commandCenterEnabled ?
                <CommunicationsWorkspaceShell
                    tabs={COMMUNICATIONS_MODAL_TABS}
                    activeTab={tab}
                    onTabChange={setTab}
                    onClose={onClose}
                    onComposeNew={() => setComposeOpen(true)}
                    showComposeNew={showComposeNew}
                >
                    <CommunicationsModalTabPanel tab={tab} />
                </CommunicationsWorkspaceShell>
            :   <div
                    className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-alloy-stone/20 bg-white"
                    data-adminv2-inbox-modal="true"
                >
                    <div className="flex min-h-[min(22rem,65vh)] flex-1 flex-col overflow-hidden bg-white p-3">
                        <InboxPanel
                            layout="modal"
                            onClose={onClose}
                            composeOpen={composeOpen}
                            onComposeOpenChange={setComposeOpen}
                        />
                    </div>
                </div>
            }
            {commandCenterEnabled ?
                <QuickMessageModal open={composeOpen} onClose={() => setComposeOpen(false)} />
            :   null}
        </AdminV2WorkspaceBosModalShell>
    );
}
