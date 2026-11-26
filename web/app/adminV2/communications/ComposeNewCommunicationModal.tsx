"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z } from "@/components/admin/Drawer";
import FamilyCommunicationWorkspaceView from "@/app/adminV2/communications/FamilyCommunicationWorkspaceView";
import {
    COMMS_FILTER_INPUT_CLASS,
    COMMS_LIST_ROW_SELECTED_CLASS,
    COMMS_PANEL_SHELL_CLASS,
    CommsWorkspacePanelReserve,
} from "@/app/adminV2/communications/commsWorkspaceUi";
import { useAdminAuthOptional } from "@/contexts/AdminAuthContext";
import { useFamilyCommunicationRuntime } from "@/lib/communications/v2/familyWorkspace/useFamilyCommunicationRuntime";
import { setCommandCenterPendingSelection } from "@/lib/communications/v2/commandCenterPrefetchCache";
import { formatQueueRowPhoneDisplay } from "@/lib/presentation/runtime/formatQueueRowContactDisplay";

type PersonHit = {
    person_id: string;
    display_name: string;
    email: string | null;
    phone: string | null;
    has_email?: boolean;
    has_phone?: boolean;
};

function formatPersonContact(hit: PersonHit): string | null {
    const email = hit.email?.trim();
    if (email) return email;
    const phone = formatQueueRowPhoneDisplay(hit.phone);
    return phone ?? hit.phone?.trim() ?? null;
}

export type ComposeNewCommunicationModalProps = {
    open: boolean;
    onClose: () => void;
    onConversationStarted?: (threadId: string) => void;
};

export default function ComposeNewCommunicationModal({
    open,
    onClose,
    onConversationStarted,
}: ComposeNewCommunicationModalProps) {
    const adminAuth = useAdminAuthOptional();
    const [portalReady, setPortalReady] = useState(false);
    const [searchQ, setSearchQ] = useState("");
    const [searchHits, setSearchHits] = useState<PersonHit[]>([]);
    const [searchBusy, setSearchBusy] = useState(false);
    const [searchErr, setSearchErr] = useState<string | null>(null);
    const [selectedPerson, setSelectedPerson] = useState<PersonHit | null>(null);
    const searchSeq = useRef(0);
    const bootstrappedRef = useRef(false);
    const prevSendTokenRef = useRef(0);

    const runtime = useFamilyCommunicationRuntime({
        entity: selectedPerson ? { entityType: "persons", entityId: selectedPerson.person_id } : undefined,
        surfaceVariant: "workspace_inbox",
        initialThreadId: null,
    });

    useEffect(() => {
        setPortalReady(true);
    }, []);

    useEffect(() => {
        if (!open) {
            setSearchQ("");
            setSearchHits([]);
            setSearchErr(null);
            setSelectedPerson(null);
            bootstrappedRef.current = false;
            prevSendTokenRef.current = 0;
            return;
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const q = searchQ.trim();
        if (q.length < 2) {
            setSearchHits([]);
            setSearchErr(null);
            return;
        }
        const seq = ++searchSeq.current;
        const t = window.setTimeout(() => {
            void (async () => {
                setSearchBusy(true);
                setSearchErr(null);
                try {
                    const qs = new URLSearchParams({ q });
                    const r = await fetch(`/api/admin/communications/person-search?${qs}`, { credentials: "include" });
                    const j = await r.json().catch(() => ({}));
                    if (searchSeq.current !== seq) return;
                    if (!r.ok) throw new Error((j as { error?: string }).error ?? `HTTP ${r.status}`);
                    const list = (j as { persons?: PersonHit[] }).persons;
                    setSearchHits(Array.isArray(list) ? list : []);
                } catch (e) {
                    if (searchSeq.current === seq) {
                        setSearchErr(e instanceof Error ? e.message : "Search failed");
                        setSearchHits([]);
                    }
                } finally {
                    if (searchSeq.current === seq) setSearchBusy(false);
                }
            })();
        }, 280);
        return () => window.clearTimeout(t);
    }, [searchQ, open]);

    useEffect(() => {
        if (!selectedPerson || !runtime.vm || bootstrappedRef.current) return;
        bootstrappedRef.current = true;
        runtime.startNewMessage();
    }, [selectedPerson, runtime.vm, runtime.startNewMessage]);

    useEffect(() => {
        if (runtime.sendCompleteToken <= prevSendTokenRef.current) return;
        prevSendTokenRef.current = runtime.sendCompleteToken;
        const threadId = runtime.selectedThreadId;
        if (!threadId) return;
        setCommandCenterPendingSelection(threadId);
        onConversationStarted?.(threadId);
        onClose();
    }, [runtime.sendCompleteToken, runtime.selectedThreadId, onConversationStarted, onClose]);

    const selectPerson = useCallback((hit: PersonHit) => {
        bootstrappedRef.current = false;
        setSelectedPerson(hit);
        setSearchQ(hit.display_name);
    }, []);

    if (!open || !portalReady) return null;

    const workspaceReady = Boolean(selectedPerson && runtime.vm);

    /*
     * Compose New is launched from INSIDE the Communications workspace, so it is
     * a nested workspace overlay, not a drawer action modal.
     *
     * The drawer action-modal layer is 80 — deliberately *below* shell chrome
     * (100), which is right for a modal raised from an entity drawer. It is wrong
     * here: this modal portals to `document.body` and opens over a workspace whose
     * own chrome sits at 100 and whose BOS layers sit at 96/97, so it rendered
     * BEHIND the very workspace it was launched from. To an operator that is
     * "Compose New does nothing."
     */
    return createPortal(
        <div
            className="fixed inset-0 flex items-center justify-center bg-alloy-midnight/35 p-4"
            style={{ zIndex: ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z }}
            data-compose-new-modal="true"
            role="dialog"
            aria-modal="true"
            aria-labelledby="compose-new-modal-title"
        >
            <div className={`flex h-[min(88vh,44rem)] w-full max-w-6xl flex-col overflow-hidden ${COMMS_PANEL_SHELL_CLASS}`}>
                <header className="flex shrink-0 items-center justify-between border-b border-alloy-stone/12 px-4 py-3">
                    <div>
                        <h2 id="compose-new-modal-title" className="text-sm font-semibold text-alloy-midnight">
                            New conversation
                        </h2>
                        <p className="mt-0.5 text-[11px] text-alloy-midnight/50">
                            Search for a family or person, then compose in the same thread workspace.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-alloy-stone/20 p-1.5 text-alloy-midnight/55 hover:bg-alloy-stone/8"
                        aria-label="Close"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </header>

                <div className="grid min-h-0 flex-1 grid-cols-[minmax(240px,28%)_minmax(0,1fr)] gap-2.5 p-2.5">
                    <aside className={`flex min-h-0 flex-col overflow-hidden ${COMMS_PANEL_SHELL_CLASS}`} aria-label="Recipient search">
                        <div className="shrink-0 border-b border-alloy-stone/12 px-3 py-2.5">
                            <label className="text-[11px] font-medium text-alloy-midnight/70">Recipient</label>
                            <input
                                value={searchQ}
                                onChange={(e) => setSearchQ(e.target.value)}
                                placeholder="Search family or person…"
                                className={`mt-1.5 ${COMMS_FILTER_INPUT_CLASS} w-full py-1.5`}
                                autoFocus
                            />
                            {searchBusy ? <p className="mt-1 text-[10px] text-alloy-midnight/45">Searching…</p> : null}
                            {searchErr ? <p className="mt-1 text-[10px] text-alloy-ember">{searchErr}</p> : null}
                        </div>
                        <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
                            {selectedPerson ? (
                                <div className={`rounded-xl px-2.5 py-2 ${COMMS_LIST_ROW_SELECTED_CLASS}`}>
                                    <div className="text-[13px] font-semibold text-alloy-midnight">{selectedPerson.display_name}</div>
                                    {formatPersonContact(selectedPerson) ? (
                                        <div className="mt-0.5 text-[10px] text-alloy-midnight/45">{formatPersonContact(selectedPerson)}</div>
                                    ) : null}
                                    <button
                                        type="button"
                                        className="mt-2 text-[10px] font-medium text-alloy-juniper hover:underline"
                                        onClick={() => {
                                            bootstrappedRef.current = false;
                                            setSelectedPerson(null);
                                            setSearchQ("");
                                        }}
                                    >
                                        Change recipient
                                    </button>
                                </div>
                            ) : null}
                            <ul className="mt-2 space-y-1">
                                {searchHits.map((hit) => (
                                    <li key={hit.person_id}>
                                        <button
                                            type="button"
                                            onClick={() => selectPerson(hit)}
                                            className="w-full rounded-lg border border-alloy-stone/15 px-2.5 py-2 text-left hover:border-alloy-stone/30 hover:bg-alloy-stone/[0.04]"
                                        >
                                            <div className="text-[12px] font-medium text-alloy-midnight">{hit.display_name}</div>
                                            {formatPersonContact(hit) ? (
                                                <div className="mt-0.5 text-[10px] text-alloy-midnight/45">{formatPersonContact(hit)}</div>
                                            ) : null}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            {!selectedPerson && searchQ.trim().length >= 2 && !searchBusy && searchHits.length === 0 && !searchErr ? (
                                <p className="px-1 py-2 text-[11px] text-alloy-midnight/45">No matches found.</p>
                            ) : null}
                        </div>
                    </aside>

                    <section className={`flex min-h-0 flex-col overflow-hidden ${COMMS_PANEL_SHELL_CLASS}`} aria-label="New conversation workspace">
                        {!selectedPerson ? (
                            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                                <p className="text-sm font-medium text-alloy-midnight/60">Start a new thread</p>
                                <p className="max-w-sm text-xs leading-relaxed text-alloy-midnight/45">
                                    Search for a family or person to load conversation context and the shared composer.
                                </p>
                            </div>
                        ) : workspaceReady ? (
                            <FamilyCommunicationWorkspaceView
                                surfaceVariant="workspace_inbox"
                                selected={{
                                    id: runtime.selected?.id ?? selectedPerson.person_id,
                                    family_label: runtime.vm?.family.label ?? selectedPerson.display_name,
                                }}
                                detail={runtime.detail}
                                childNames={runtime.childNames}
                                stageLabel={runtime.vm?.family.stage ?? null}
                                healthTone={runtime.healthTone}
                                healthDot={runtime.healthDot}
                                healthLabel={runtime.healthLabel}
                                workspaceMode={runtime.workspaceMode}
                                onWorkspaceModeChange={runtime.setWorkspaceMode}
                                workspaceModeAvailability={runtime.workspaceModeAvailability}
                                LIVE_WORKSPACE={true}
                                selectedThreadId={runtime.selectedThreadId}
                                selectedThread={runtime.selectedThread}
                                messages={runtime.messages}
                                liveRecipientGroups={runtime.vm?.recipientGroups ?? null}
                                selectedRecipientIds={runtime.selectedRecipientIds}
                                liveChannel={runtime.liveChannel}
                                subjectDraft={runtime.subjectDraft}
                                bodyDraft={runtime.bodyDraft}
                                sendResult={runtime.sendResult}
                                sendError={runtime.sendError}
                                sending={runtime.sending}
                                assignBusy={false}
                                onClaim={() => {}}
                                onAllMessages={runtime.showAllMessages}
                                onOpenThread={runtime.openThread}
                                onToggleRecipient={runtime.toggleRecipient}
                                onSubjectChange={runtime.setSubjectDraft}
                                onBodyChange={runtime.setBodyDraft}
                                onSendNow={() => void runtime.send(false)}
                                onConfirmSend={() => void runtime.send(true)}
                                onDismissSend={runtime.dismissSendResult}
                                viewerUserId={adminAuth?.userId ?? null}
                                sendCompleteToken={runtime.sendCompleteToken}
                            />
                        ) : runtime.error ? (
                            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                                <p className="text-sm font-medium text-alloy-ember">{runtime.error}</p>
                            </div>
                        ) : (
                            <CommsWorkspacePanelReserve label="Loading conversation context" />
                        )}
                    </section>
                </div>
            </div>
        </div>,
        document.body,
    );
}
