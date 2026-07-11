"use client";

import { useCallback, useEffect, useState } from "react";

import AdminV2WorkspaceBosModalShell from "@/app/adminV2/components/AdminV2WorkspaceBosModalShell";
import InboxPanel from "@/app/adminV2/messages/InboxPanel";
import CommunicationsModalTabPanel, {
    COMMUNICATIONS_MODAL_TABS,
    COMMUNICATIONS_TAB_MODE,
    defaultCommunicationsTabForMode,
    type CommunicationsModalTab,
} from "@/app/adminV2/communications/CommunicationsModalTabPanel";
import CommunicationsWorkspaceShell from "@/app/adminV2/communications/CommunicationsWorkspaceShell";
import { CommunicationsWorkspaceKpiProvider } from "@/app/adminV2/communications/CommunicationsWorkspaceKpiContext";
import ComposeNewCommunicationModal from "@/app/adminV2/communications/ComposeNewCommunicationModal";
import { getCommandCenterPendingSelection } from "@/lib/communications/v2/commandCenterPrefetchCache";
import { warmCommunicationsWorkspaceModal } from "@/lib/communications/v2/communicationsWorkspaceWarmCache";
import {
    ADMIN_V2_OPEN_COMMUNICATIONS_THREAD,
    type OpenCommunicationsThreadDetail,
} from "@/lib/workItems/workItemsNavigation";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";

export type InboxModalProps = {
    open: boolean;
    onClose: () => void;
};

export default function InboxModal({ open, onClose }: InboxModalProps) {
    const [composeOpen, setComposeOpen] = useState(false);
    const [tab, setTab] = useState<CommunicationsModalTab>("overview");
    const commandCenterEnabled = isCommsV2FlagEnabled("comms_v2_command_center");

    useEffect(() => {
        if (open) return;
        const resetId = window.setTimeout(() => {
            setComposeOpen(false);
            setTab("overview");
        }, 0);
        return () => window.clearTimeout(resetId);
    }, [open]);

    const focusInboxForThread = useCallback((threadId?: string | null) => {
        const id = threadId?.trim() || getCommandCenterPendingSelection()?.trim();
        if (!id) return;
        setTab("inbox");
    }, []);

    useEffect(() => {
        if (!open || !commandCenterEnabled) return;
        void warmCommunicationsWorkspaceModal();
        focusInboxForThread(getCommandCenterPendingSelection());
    }, [commandCenterEnabled, focusInboxForThread, open]);

    useEffect(() => {
        if (!commandCenterEnabled) return;
        const onOpenThread = (event: Event) => {
            const detail = (event as CustomEvent<OpenCommunicationsThreadDetail>).detail;
            focusInboxForThread(detail?.thread_id ?? null);
        };
        window.addEventListener(ADMIN_V2_OPEN_COMMUNICATIONS_THREAD, onOpenThread as EventListener);
        return () => window.removeEventListener(ADMIN_V2_OPEN_COMMUNICATIONS_THREAD, onOpenThread as EventListener);
    }, [commandCenterEnabled, focusInboxForThread]);

    const showComposeNew = commandCenterEnabled ? tab === "inbox" || tab === "overview" : !commandCenterEnabled;

    return (
        <AdminV2WorkspaceBosModalShell
            open={open}
            onClose={onClose}
            dataModalAttr="adminv2-inbox-modal"
            ariaLabelledBy="adminv2-inbox-modal-title"
            panelClassName="max-h-[min(88vh,44rem)]"
        >
            {commandCenterEnabled ?
                <CommunicationsWorkspaceKpiProvider>
                    <CommunicationsWorkspaceShell
                        tabs={COMMUNICATIONS_MODAL_TABS}
                        activeTab={tab}
                        onTabChange={setTab}
                        mode={COMMUNICATIONS_TAB_MODE[tab]}
                        onModeChange={(m) => setTab(defaultCommunicationsTabForMode(m))}
                        onClose={onClose}
                        onComposeNew={() => setComposeOpen(true)}
                        showComposeNew={showComposeNew}
                    >
                        <CommunicationsModalTabPanel
                            tab={tab}
                            onNavigateTab={setTab}
                            onComposeNew={() => setComposeOpen(true)}
                        />
                    </CommunicationsWorkspaceShell>
                </CommunicationsWorkspaceKpiProvider>
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
                <ComposeNewCommunicationModal
                    open={composeOpen}
                    onClose={() => setComposeOpen(false)}
                    onConversationStarted={() => setTab("inbox")}
                />
            :   null}
        </AdminV2WorkspaceBosModalShell>
    );
}
