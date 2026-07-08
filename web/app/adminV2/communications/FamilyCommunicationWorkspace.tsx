"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { computeCommunicationHealth } from "@/lib/communications/v2/communicationHealth";
import { toggleRecipientSelection } from "@/lib/communications/v2/familyWorkspace/composerSelection";
import type { ComposerChannel, FamilyCommunicationWorkspaceVM, TimelineEventVM } from "@/lib/communications/v2/familyWorkspace/types";
import type { FamilySendResult } from "@/lib/communications/v2/familyWorkspace/orchestrateFamilySend";
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

export default function FamilyCommunicationWorkspace(props: {
    customerId?: string;
    entity?: { entityType: string; entityId: string };
    channel?: "email" | "sms";
}) {
    const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(() =>
        props.channel === "sms" ? "sms" : "email",
    );
    const liveChannel: ComposerChannel = workspaceMode === "sms" ? "sms" : "email";
    const [vm, setVm] = useState<FamilyCommunicationWorkspaceVM | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
    const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
    const [subjectDraft, setSubjectDraft] = useState("");
    const [bodyDraft, setBodyDraft] = useState("");
    const [sendResult, setSendResult] = useState<FamilySendResult | null>(null);
    const [sendError, setSendError] = useState<string | null>(null);
    const [sending, setSending] = useState(false);

    const queryFor = useCallback(
        (threadId: string | null): string | null => {
            const base = new URLSearchParams();
            if (props.customerId) base.set("customer_id", props.customerId);
            else if (props.entity?.entityId) { base.set("entity_type", props.entity.entityType); base.set("entity_id", props.entity.entityId); }
            else return null;
            base.set("composer_channel", liveChannel);
            if (threadId) base.set("thread_id", threadId);
            return base.toString();
        },
        [props.customerId, props.entity?.entityType, props.entity?.entityId, liveChannel]
    );

    const load = useCallback(
        async (threadId: string | null, resetSelection: boolean) => {
            const qs = queryFor(threadId);
            if (!qs) { setLoading(false); return; }
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/admin/communications/family-workspace?${qs}`);
                const data = (await res.json()) as { workspace?: FamilyCommunicationWorkspaceVM; error?: string };
                if (!res.ok || !data.workspace) { setError(data.error ?? "Failed to load"); return; }
                setVm(data.workspace);
                if (resetSelection) setSelectedRecipientIds(data.workspace.selectedRecipients);
            } catch {
                setError("Failed to load");
            } finally {
                setLoading(false);
            }
        },
        [queryFor]
    );

    useEffect(() => { setSelectedThreadId(null); setSubjectDraft(""); setBodyDraft(""); setSendResult(null); void load(null, true); }, [load]);

    const openThread = useCallback((threadId: string) => { setSelectedThreadId(threadId); void load(threadId, false); }, [load]);

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
                if (confirm) await load(selectedThreadId, false);
            } catch {
                setSendError("Send failed");
            } finally {
                setSending(false);
            }
        },
        [vm, selectedRecipientIds, subjectDraft, bodyDraft, selectedThreadId, liveChannel, load]
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
        <section data-cc-column="workspace" data-cc-drawer-workspace className="flex h-full min-h-[520px] flex-col overflow-hidden rounded-2xl border border-alloy-stone/12 bg-white shadow-[0_1px_3px_rgba(20,30,25,0.05)]">
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
