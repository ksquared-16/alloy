"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { computeCommunicationHealth } from "@/lib/communications/v2/communicationHealth";
import { toggleRecipientSelection } from "@/lib/communications/v2/familyWorkspace/composerSelection";
import type { ComposerChannel, FamilyCommunicationWorkspaceVM, TimelineEventVM } from "@/lib/communications/v2/familyWorkspace/types";
import type { FamilySendResult } from "@/lib/communications/v2/familyWorkspace/orchestrateFamilySend";
import {
    getDrawerFamilyWorkspaceWarm,
    invalidateDrawerFamilyWorkspaceCache,
    prefetchDrawerFamilyWorkspace,
    type DrawerFamilyWorkspacePrefetchParams,
} from "@/lib/communications/v2/drawerFamilyWorkspacePrefetchCache";
import {
    resolveWorkspaceModeAvailability,
    type WorkspaceMode,
} from "@/lib/communications/v2/workspaceModeAvailability";
import FamilyCommunicationWorkspaceView, { type WorkspaceTimelineMessage } from "@/app/adminV2/communications/FamilyCommunicationWorkspaceView";
import { CommsWorkspacePanelReserve } from "@/app/adminV2/communications/commsWorkspaceUi";

/**
 * UI-6 / UI-6.1 — drawer Family Communication Workspace (no queue). Thin container: fetches the VM by
 * customerId or drawer entity and renders the CANONICAL FamilyCommunicationWorkspaceView (the same
 * markup the full Communications modal uses). All timeline/composer UI lives in the View, once.
 */
const toWorkspaceMessage = (e: TimelineEventVM): WorkspaceTimelineMessage => ({
    id: e.id, direction: e.direction, channel: e.channel, body: e.body, created_at: e.createdAt, kind: e.kind, thread_id: e.threadId, status: e.status,
});

function resolvePrefetchParams(
    props: {
        customerId?: string;
        entity?: { entityType: string; entityId: string };
    },
    composerChannel: ComposerChannel,
    threadId: string | null
): DrawerFamilyWorkspacePrefetchParams | null {
    if (props.customerId) {
        return { customerId: props.customerId, composerChannel, threadId };
    }
    if (props.entity?.entityId) {
        return {
            entityType: props.entity.entityType,
            entityId: props.entity.entityId,
            composerChannel,
            threadId,
        };
    }
    return null;
}

function resolveInvalidateScope(props: {
    customerId?: string;
    entity?: { entityType: string; entityId: string };
}): { customerId?: string; entityType?: string; entityId?: string } | undefined {
    if (props.customerId) return { customerId: props.customerId };
    if (props.entity?.entityId) {
        return { entityType: props.entity.entityType, entityId: props.entity.entityId };
    }
    return undefined;
}

export default function FamilyCommunicationWorkspace(props: {
    customerId?: string;
    entity?: { entityType: string; entityId: string };
    channel?: "email" | "sms";
}) {
    const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(() =>
        props.channel === "sms" ? "sms" : "email",
    );
    const liveChannel: ComposerChannel = workspaceMode === "sms" ? "sms" : "email";
    const initialPrefetchParams = useMemo(
        () => resolvePrefetchParams(props, liveChannel, null),
        [props.customerId, props.entity?.entityType, props.entity?.entityId, liveChannel]
    );
    const [vm, setVm] = useState<FamilyCommunicationWorkspaceVM | null>(() =>
        initialPrefetchParams ? getDrawerFamilyWorkspaceWarm(initialPrefetchParams) : null
    );
    const [loading, setLoading] = useState(() => !vm);
    const [servedFromWarmCache, setServedFromWarmCache] = useState(() => Boolean(vm));
    const [error, setError] = useState<string | null>(null);
    const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
    const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
    const [subjectDraft, setSubjectDraft] = useState("");
    const [bodyDraft, setBodyDraft] = useState("");
    const [sendResult, setSendResult] = useState<FamilySendResult | null>(null);
    const [sendError, setSendError] = useState<string | null>(null);
    const [sending, setSending] = useState(false);

    const applyWorkspace = useCallback((workspace: FamilyCommunicationWorkspaceVM, resetSelection: boolean) => {
        setVm(workspace);
        if (resetSelection) setSelectedRecipientIds(workspace.selectedRecipients);
        setError(null);
    }, []);

    const load = useCallback(
        async (threadId: string | null, resetSelection: boolean, opts?: { force?: boolean }) => {
            const params = resolvePrefetchParams(props, liveChannel, threadId);
            if (!params) {
                setLoading(false);
                return;
            }

            const warm = !opts?.force ? getDrawerFamilyWorkspaceWarm(params) : null;
            if (warm) {
                applyWorkspace(warm, resetSelection);
                setLoading(false);
                setServedFromWarmCache(true);
                void prefetchDrawerFamilyWorkspace(params, { force: true }).then((fresh) => {
                    if (fresh) applyWorkspace(fresh, resetSelection);
                });
                return;
            }

            setLoading(true);
            setError(null);
            try {
                const workspace = await prefetchDrawerFamilyWorkspace(params, opts);
                if (!workspace) {
                    setError("Failed to load");
                    return;
                }
                applyWorkspace(workspace, resetSelection);
            } catch {
                setError("Failed to load");
            } finally {
                setLoading(false);
            }
        },
        [applyWorkspace, liveChannel, props.customerId, props.entity?.entityType, props.entity?.entityId]
    );

    useEffect(() => {
        setSelectedThreadId(null);
        setSubjectDraft("");
        setBodyDraft("");
        setSendResult(null);
        setServedFromWarmCache(false);
        void load(null, true);
    }, [load]);

    const openThread = useCallback((threadId: string) => {
        setSelectedThreadId(threadId);
        void load(threadId, false);
    }, [load]);

    const runSend = useCallback(
        async (confirm: boolean) => {
            const cust = vm?.scope.customerId;
            if (!cust || selectedRecipientIds.length === 0 || !bodyDraft.trim()) return;
            setSending(true);
            setSendError(null);
            try {
                const res = await fetch("/api/admin/communications/family-send", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ customer_id: cust, recipient_person_ids: selectedRecipientIds, channel: liveChannel, subject: subjectDraft, body: bodyDraft, reply_to_thread_id: selectedThreadId, confirm }),
                });
                const data = (await res.json()) as FamilySendResult & { error?: string };
                if (!res.ok) { setSendError(data.error ?? "Send failed"); return; }
                setSendResult(data);
                if (confirm) {
                    const scope = resolveInvalidateScope(props);
                    if (scope) invalidateDrawerFamilyWorkspaceCache(scope);
                    await load(selectedThreadId, false, { force: true });
                }
            } catch {
                setSendError("Send failed");
            } finally {
                setSending(false);
            }
        },
        [vm, selectedRecipientIds, subjectDraft, bodyDraft, selectedThreadId, liveChannel, load, props.customerId, props.entity?.entityType, props.entity?.entityId]
    );

    const workspaceModeAvailability = useMemo(
        () => resolveWorkspaceModeAvailability(vm, vm?.relatedTasks.length ?? 0),
        [vm],
    );

    const events: TimelineEventVM[] = vm ? (selectedThreadId ? vm.messages : vm.timelineEvents) : [];
    const messages = useMemo(() => events.map(toWorkspaceMessage), [events]);
    const health = useMemo(
        () => computeCommunicationHealth({ messages: events.filter((e) => !e.kind || e.kind === "message").map((e) => ({ direction: e.direction, created_at: e.createdAt, channel: e.channel, opened_at: e.openedAt, replied_at: e.repliedAt })) }),
        [events]
    );
    const healthLabel = health.engagementScore >= 66 ? "Healthy" : health.engagementScore >= 33 ? "At risk" : "Unresponsive";
    const healthTone = health.engagementScore >= 66 ? "text-alloy-juniper" : health.engagementScore >= 33 ? "text-alloy-amber" : "text-red-600";
    const healthDot = health.engagementScore >= 66 ? "bg-alloy-juniper" : health.engagementScore >= 33 ? "bg-alloy-amber" : "bg-red-500";

    if (loading && !vm) return <CommsWorkspacePanelReserve />;
    if (error && !vm) return <div className="p-4 text-xs text-alloy-ember">{error}</div>;
    if (!vm) return <div className="p-4 text-xs text-alloy-midnight/45">No conversation.</div>;

    const allRecipients = vm.recipientGroups.flatMap((g) => g.recipients);
    const childNames = vm.children.map((c) => (c.ageLabel ? `${c.name} (${c.ageLabel})` : c.name));
    const detail = {
        owner: vm.family.ownerLabel ?? "Unassigned",
        contactName: allRecipients[0]?.displayName ?? vm.family.label,
        program: vm.family.program,
        stage: vm.family.stage,
        consent: vm.consentSummary.household,
    };
    const selected = { id: vm.scope.customerId, family_label: vm.family.label, sla_state: null, assignment_state: "unassigned" };

    return (
        <section
            data-cc-column="workspace"
            data-cc-drawer-workspace
            data-drawer-family-workspace-warm={servedFromWarmCache ? "true" : undefined}
            className="flex h-full min-h-[520px] flex-col overflow-hidden rounded-2xl border border-alloy-stone/12 bg-white shadow-[0_1px_3px_rgba(20,30,25,0.05)]"
        >
            <FamilyCommunicationWorkspaceView
                selected={selected}
                detail={detail}
                childNames={childNames}
                healthTone={healthTone}
                healthDot={healthDot}
                healthLabel={healthLabel}
                workspaceMode={workspaceMode}
                onWorkspaceModeChange={setWorkspaceMode}
                workspaceModeAvailability={workspaceModeAvailability}
                LIVE_WORKSPACE={true}
                selectedThreadId={selectedThreadId}
                messages={messages}
                liveRecipientGroups={vm.recipientGroups}
                selectedRecipientIds={selectedRecipientIds}
                liveChannel={liveChannel}
                subjectDraft={subjectDraft}
                bodyDraft={bodyDraft}
                sendResult={sendResult}
                sendError={sendError}
                sending={sending}
                assignBusy={false}
                onClaim={() => {}}
                onAllMessages={() => { setSelectedThreadId(null); void load(null, false); }}
                onOpenThread={openThread}
                onToggleRecipient={(id) => setSelectedRecipientIds((prev) => toggleRecipientSelection(prev, id, true))}
                onSubjectChange={setSubjectDraft}
                onBodyChange={setBodyDraft}
                onSendNow={() => void runSend(false)}
                onConfirmSend={() => void runSend(true)}
                onDismissSend={() => { setSendResult(null); setSendError(null); }}
            />
        </section>
    );
}
