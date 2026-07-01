"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
    groupConversationsByQueue,
    computeCommandCenterMetrics,
    applyQueueFilters,
    visibleCommandCenterQueues,
    flattenVisibleConversationIds,
    resolveCommandCenterSelection,
    conversationDisplayTitle,
    conversationDisplayRecipient,
    conversationDisplaySubtitle,
    conversationUnreadCount,
    conversationQueueStatusPill,
    queueStatusPillClass,
    resolveCommandCenterHealthDisplay,
    type ConversationSummary,
    type CommandCenterFilters,
} from "@/lib/communications/v2/commandCenterViewModel";
import {
    getCommandCenterCacheSnapshot,
    getCommandCenterFirstConversationWarm,
    getCommandCenterWarmSelectedConversationId,
    prefetchCommandCenterConversations,
    subscribeCommandCenterCache,
} from "@/lib/communications/v2/commandCenterPrefetchCache";
import { buildCommandCenterRecordLinks, type CommandCenterRecordLink } from "@/lib/communications/v2/commandCenterRecordLinks";
import { fetchCommandCenterThreadMessages, type CommandCenterTimelineMessage } from "@/lib/communications/v2/commandCenterThreadMessages";
import { relTime } from "@/lib/communications/v2/familyWorkspace/timelinePresentation";
import { computeCommunicationHealth } from "@/lib/communications/v2/communicationHealth";
import FamilyCommunicationWorkspaceView, { type WorkspaceDetail } from "@/app/adminV2/communications/FamilyCommunicationWorkspaceView";
import { useCommunicationsWorkspaceKpiOptional } from "@/app/adminV2/communications/CommunicationsWorkspaceKpiContext";
import {
    COMMS_FILTER_INPUT_CLASS,
    COMMS_LIST_ROW_SELECTED_CLASS,
    COMMS_PANEL_SHELL_CLASS,
    CommsQueueListReserve,
    CommsWorkspacePanelReserve,
} from "@/app/adminV2/communications/commsWorkspaceUi";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import { useAdminDrawerOptional } from "@/contexts/AdminDrawerContext";
import type { FamilyCommunicationWorkspaceVM, RecipientGroup, ComposerChannel } from "@/lib/communications/v2/familyWorkspace/types";
import { toggleRecipientSelection } from "@/lib/communications/v2/familyWorkspace/composerSelection";
import type { FamilySendResult } from "@/lib/communications/v2/familyWorkspace/orchestrateFamilySend";
import { resolveWorkspaceModeAvailability, type WorkspaceMode } from "@/lib/communications/v2/workspaceModeAvailability";
import { conversationAttentionLabel, type TriageActionKey } from "@/lib/communications/v2/conversationTriage";
import type { PreferenceFieldKey } from "@/lib/communications/v2/communicationPreferenceLabels";
import {
    buildOperationalTaskBody,
    createOperationalTask,
    patchOperationalTaskStatus,
} from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import {
    COMMS_FIXTURES_ENABLED,
    FIXTURE_CONVERSATIONS,
    FIXTURE_MESSAGES,
    FIXTURE_FAMILY_DETAILS,
    type FixtureFamilyDetail,
} from "@/app/adminV2/communications/fixtures";

/**
 * Communications V2 — Command Center body (UI-4H final visual lock). Renders INSIDE the
 * existing modal shell; the BOS rail is the shell's and is untouched.
 * Layout: Queue (~25%) | Conversation (~32%) | Composer (~43%).
 *   - Conversation column = compact Family Snapshot band + conversation history (chat).
 *   - Composer = top-anchored, full-height, message body the dominant surface.
 * Presentation only; fixture mode kept; no data/route/outer-geometry/BOS/flag change.
 */
type TimelineMessage = CommandCenterTimelineMessage;

function mapLiveEvents(events: FamilyCommunicationWorkspaceVM["timelineEvents"]): TimelineMessage[] {
    return events.map((e) => ({
        id: e.id,
        direction: e.direction,
        channel: e.channel,
        body: e.body,
        created_at: e.createdAt,
        kind: e.kind,
        opened_at: e.openedAt,
        replied_at: e.repliedAt,
        thread_id: e.threadId,
        status: e.status,
    }));
}

function initialWorkspaceFromWarm(): {
    messages: TimelineMessage[];
    liveChildren: string[] | null;
    liveRecipientGroups: RecipientGroup[] | null;
    selectedRecipientIds: string[];
} | null {
    const warm = getCommandCenterFirstConversationWarm();
    if (!warm) return null;
    if (warm.workspace) {
        const threadMsgs = warm.threadMessages?.length
            ? warm.threadMessages
            : mapLiveEvents(warm.workspace.messages.length ? warm.workspace.messages : warm.workspace.timelineEvents);
        return {
            messages: threadMsgs,
            liveChildren: warm.workspace.children.map((c) => c.name),
            liveRecipientGroups: warm.workspace.recipientGroups,
            selectedRecipientIds: warm.workspace.selectedRecipients,
        };
    }
    if (warm.threadMessages) {
        return {
            messages: warm.threadMessages,
            liveChildren: null,
            liveRecipientGroups: null,
            selectedRecipientIds: [],
        };
    }
    return null;
}

function initialConversations(): ConversationSummary[] {
    if (COMMS_FIXTURES_ENABLED) return FIXTURE_CONVERSATIONS;
    return getCommandCenterCacheSnapshot()?.conversations ?? [];
}

function initialSelectedId(): string | null {
    if (COMMS_FIXTURES_ENABLED) return FIXTURE_CONVERSATIONS[0]?.id ?? null;
    return getCommandCenterWarmSelectedConversationId();
}

function initialLoading(): boolean {
    if (COMMS_FIXTURES_ENABLED) return false;
    return !getCommandCenterCacheSnapshot();
}

function initialHydratingWorkspace(): boolean {
    if (COMMS_FIXTURES_ENABLED) return false;
    if (getCommandCenterFirstConversationWarm()) return false;
    return Boolean(getCommandCenterCacheSnapshot()?.conversations.length);
}

const attnAccent = (a: string | null | undefined): { rail: string; tint: string; dot: string } => {
    switch (a) {
        case "awaiting_parent_reply": return { rail: "border-l-alloy-amber", tint: "bg-alloy-amber/10", dot: "bg-alloy-amber" };
        case "needs_follow_up": return { rail: "border-l-alloy-amber", tint: "bg-alloy-amber/10", dot: "bg-alloy-amber" };
        case "documents_missing": return { rail: "border-l-alloy-ember", tint: "bg-alloy-ember/10", dot: "bg-alloy-ember" };
        case "re_enrollment_outreach": return { rail: "border-l-alloy-juniper", tint: "bg-alloy-juniper/10", dot: "bg-alloy-juniper" };
        case "waitlist_update": return { rail: "border-l-alloy-blue", tint: "bg-alloy-blue/10", dot: "bg-alloy-blue" };
        default: return { rail: "border-l-alloy-stone/30", tint: "bg-white", dot: "bg-alloy-stone/40" };
    }
};





const LIVE_WORKSPACE = isCommsV2FlagEnabled("comms_v2_live_workspace");
const ASSIGNMENT_ENABLED = isCommsV2FlagEnabled("comms_v2_assignment");

const warmWorkspaceSeed = initialWorkspaceFromWarm();

export default function CommandCenterShell() {
    const adminDrawer = useAdminDrawerOptional();
    const kpiContext = useCommunicationsWorkspaceKpiOptional();
    const [conversations, setConversations] = useState<ConversationSummary[]>(initialConversations);
    const [loading, setLoading] = useState(initialLoading);
    const [error, setError] = useState<string | null>(null);
    const [filters, setFilters] = useState<CommandCenterFilters>({});
    const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
    const [messages, setMessages] = useState<TimelineMessage[]>(
        COMMS_FIXTURES_ENABLED
            ? (FIXTURE_MESSAGES[FIXTURE_CONVERSATIONS[0]?.id ?? ""] ?? [])
            : (warmWorkspaceSeed?.messages ?? [])
    );
    const [liveWorkspaceVm, setLiveWorkspaceVm] = useState<FamilyCommunicationWorkspaceVM | null>(null);
    const [assignBusy, setAssignBusy] = useState(false);
    const [liveChildren, setLiveChildren] = useState<string[] | null>(warmWorkspaceSeed?.liveChildren ?? null);
    const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
    const [liveRecipientGroups, setLiveRecipientGroups] = useState<RecipientGroup[] | null>(
        warmWorkspaceSeed?.liveRecipientGroups ?? null
    );
    const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>(
        warmWorkspaceSeed?.selectedRecipientIds ?? []
    );
    const [subjectDraft, setSubjectDraft] = useState("");
    const [bodyDraft, setBodyDraft] = useState("");
    const [sendResult, setSendResult] = useState<FamilySendResult | null>(null);
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const [hydratingWorkspace, setHydratingWorkspace] = useState(initialHydratingWorkspace);
    const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("email");
    const [noteDraft, setNoteDraft] = useState("");
    const [noteSaving, setNoteSaving] = useState(false);
    const [noteError, setNoteError] = useState<string | null>(null);
    const [taskTitleDraft, setTaskTitleDraft] = useState("");
    const [taskDueDraft, setTaskDueDraft] = useState("");
    const [taskSaving, setTaskSaving] = useState(false);
    const [taskError, setTaskError] = useState<string | null>(null);
    const [preferenceSaving, setPreferenceSaving] = useState(false);
    const [triageBusy, setTriageBusy] = useState(false);

    const loadLive = useCallback(async (customerId: string, threadId: string, resetSelection = false, composerChannel: ComposerChannel = "email") => {
        try {
            const qs = `customer_id=${encodeURIComponent(customerId)}&thread_id=${encodeURIComponent(threadId)}&composer_channel=${encodeURIComponent(composerChannel)}`;
            const res = await fetch(`/api/admin/communications/family-workspace?${qs}`);
            if (!res.ok) return null;
            const data = (await res.json()) as { workspace?: FamilyCommunicationWorkspaceVM };
            const vm = data.workspace;
            if (!vm) return null;
            let msgs = mapLiveEvents(vm.messages.length ? vm.messages : vm.timelineEvents);
            if (msgs.length === 0) {
                msgs = await fetchCommandCenterThreadMessages(threadId);
            }
            setLiveWorkspaceVm(vm);
            setMessages(msgs);
            setLiveChildren(vm.children.map((c) => c.name));
            setLiveRecipientGroups(vm.recipientGroups);
            if (resetSelection) setSelectedRecipientIds(vm.selectedRecipients);
            return vm;
        } catch {
            return null;
        }
    }, []);

    const loadConversations = useCallback(async (opts?: { background?: boolean }) => {
        if (COMMS_FIXTURES_ENABLED) return;
        if (!opts?.background) {
            if (!getCommandCenterCacheSnapshot()) {
                setLoading(true);
            }
            setError(null);
        }
        try {
            const snap = await prefetchCommandCenterConversations();
            setConversations(snap.conversations);
            if (snap.error) setError(snap.error);
            else setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load conversations");
        } finally {
            if (!opts?.background) setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (COMMS_FIXTURES_ENABLED) return;
        return subscribeCommandCenterCache(() => {
            const snap = getCommandCenterCacheSnapshot();
            if (snap) setConversations(snap.conversations);
            const warm = getCommandCenterFirstConversationWarm();
            if (!warm) return;
            const seeded = initialWorkspaceFromWarm();
            if (!seeded) return;
            setSelectedId((prev) => prev ?? warm.conversationId);
            setMessages(seeded.messages);
            setLiveChildren(seeded.liveChildren);
            setLiveRecipientGroups(seeded.liveRecipientGroups);
            setSelectedRecipientIds(seeded.selectedRecipientIds);
            setHydratingWorkspace(false);
        });
    }, []);

    useEffect(() => {
        void loadConversations({ background: !!getCommandCenterCacheSnapshot() });
        if (LIVE_WORKSPACE && COMMS_FIXTURES_ENABLED) {
            const c = FIXTURE_FAMILY_DETAILS[FIXTURE_CONVERSATIONS[0]?.id ?? ""]?.customerId;
            const tid = FIXTURE_CONVERSATIONS[0]?.id;
            if (c && tid) void loadLive(c, tid, true);
        }
    }, [loadConversations, loadLive]);

    const openConversation = useCallback(async (id: string) => {
        setSelectedId(id);
        setSelectedThreadId(null);
        setWorkspaceMode("email");
        setSubjectDraft("");
        setBodyDraft("");
        setLiveWorkspaceVm(null);
        const conv = conversations.find((c) => c.id === id);
        const warm = getCommandCenterFirstConversationWarm();
        if (warm?.conversationId === id) {
            const seeded = initialWorkspaceFromWarm();
            if (seeded) {
                setMessages(seeded.messages);
                setLiveChildren(seeded.liveChildren);
                setLiveRecipientGroups(seeded.liveRecipientGroups);
                setSelectedRecipientIds(seeded.selectedRecipientIds);
                if (warm.workspace) setLiveWorkspaceVm(warm.workspace);
                return;
            }
        }
        setHydratingWorkspace(true);
        try {
            if (COMMS_FIXTURES_ENABLED) {
                const liveCustomerId = LIVE_WORKSPACE ? FIXTURE_FAMILY_DETAILS[id]?.customerId : undefined;
                if (liveCustomerId) {
                    await loadLive(liveCustomerId, id, true);
                    return;
                }
                setMessages(FIXTURE_MESSAGES[id] ?? []);
                setLiveChildren(null);
                return;
            }
            setMessages([]);
            const liveCustomerId = LIVE_WORKSPACE ? conv?.customer_id : undefined;
            if (liveCustomerId) {
                const vm = await loadLive(liveCustomerId, id, true);
                if (!vm && conv?.last_message_preview) {
                    setMessages(await fetchCommandCenterThreadMessages(id));
                }
                return;
            }
            setMessages(await fetchCommandCenterThreadMessages(id));
        } finally {
            setHydratingWorkspace(false);
        }
    }, [loadLive, conversations]);

    const claim = useCallback(
        async (id: string) => {
            if (COMMS_FIXTURES_ENABLED) return;
            setAssignBusy(true);
            try {
                await fetch(`/api/admin/communications/conversations/${id}/assign`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "claim" }),
                });
                await loadConversations();
            } finally {
                setAssignBusy(false);
            }
        },
        [loadConversations]
    );

    const selected = useMemo(() => conversations.find((c) => c.id === selectedId) ?? null, [conversations, selectedId]);
    const selectedCustomerId = useMemo(() => {
        if (COMMS_FIXTURES_ENABLED && selectedId) return FIXTURE_FAMILY_DETAILS[selectedId]?.customerId ?? null;
        return selected?.customer_id ?? null;
    }, [selected, selectedId]);

    const openThread = useCallback(
        async (threadId: string) => {
            if (!LIVE_WORKSPACE) return;
            setSelectedThreadId(threadId);
            const cust = selectedCustomerId;
            if (cust) await loadLive(cust, threadId);
        },
        [loadLive, selectedCustomerId]
    );

    const recordLinks = useMemo((): CommandCenterRecordLink[] => {
        if (!selected) return [];
        const childLinks =
            liveWorkspaceVm?.children.map((c) => ({ id: c.id, name: c.name })) ??
            selected.child_links ??
            null;
        const stageDisplay = selected.stage_label ?? liveWorkspaceVm?.family.stage ?? null;
        return buildCommandCenterRecordLinks(selected, childLinks).map((link) =>
            link.type === "opportunities" && stageDisplay ? { ...link, label: stageDisplay } : link
        );
    }, [selected, liveWorkspaceVm]);

    const openRecordLink = useCallback(
        (link: CommandCenterRecordLink) => {
            if (!adminDrawer) return;
            adminDrawer.openDrawer({ type: link.type, id: link.id });
        },
        [adminDrawer]
    );

    const workspaceModeAvailability = useMemo(
        () => resolveWorkspaceModeAvailability(liveWorkspaceVm, liveWorkspaceVm?.relatedTasks.length ?? 0),
        [liveWorkspaceVm]
    );

    const liveChannel: ComposerChannel = workspaceMode === "sms" ? "sms" : "email";

    const liveWorkspaceDetail = useMemo(() => {
        if (!liveWorkspaceVm) return undefined;
        const primaryRecipient =
            liveWorkspaceVm.recipientGroups.flatMap((g) => g.recipients).find((r) => r.isPrimary) ??
            liveWorkspaceVm.recipientGroups.flatMap((g) => g.recipients)[0];
        return {
            owner: liveWorkspaceVm.family.ownerLabel ?? "Unassigned",
            contactName: primaryRecipient?.displayName ?? liveWorkspaceVm.family.label,
            program: liveWorkspaceVm.family.program,
            stage: liveWorkspaceVm.family.stage,
            consent: liveWorkspaceVm.consentSummary.household,
            preferenceProfile: liveWorkspaceVm.consentSummary.preferenceProfile,
        };
    }, [liveWorkspaceVm]);

    const refreshWorkspace = useCallback(async () => {
        if (!selectedCustomerId || !selectedId) return;
        await loadLive(selectedCustomerId, selectedThreadId ?? selectedId, false, liveChannel);
    }, [loadLive, selectedCustomerId, selectedId, selectedThreadId, liveChannel]);

    const primaryPersonId = useMemo(() => {
        const primary = liveWorkspaceVm?.recipientGroups.flatMap((g) => g.recipients).find((r) => r.isPrimary);
        return primary?.id ?? liveWorkspaceVm?.selectedRecipients[0] ?? selected?.primary_contact_person_id ?? null;
    }, [liveWorkspaceVm, selected]);

    const runAddNote = useCallback(async () => {
        if (!LIVE_WORKSPACE || !selectedCustomerId || !noteDraft.trim()) return;
        setNoteSaving(true);
        setNoteError(null);
        try {
            const res = await fetch("/api/admin/communications/family-note", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    customer_id: selectedCustomerId,
                    body: noteDraft,
                    opportunity_id: liveWorkspaceVm?.scope.focusOpportunityId ?? selected?.opportunity_id ?? null,
                    person_id: primaryPersonId,
                }),
            });
            const data = (await res.json()) as { error?: string };
            if (!res.ok) {
                setNoteError(data.error ?? "Failed to save note");
                return;
            }
            setNoteDraft("");
            await refreshWorkspace();
        } catch {
            setNoteError("Failed to save note");
        } finally {
            setNoteSaving(false);
        }
    }, [LIVE_WORKSPACE, selectedCustomerId, noteDraft, liveWorkspaceVm, selected, primaryPersonId, refreshWorkspace]);

    const runCreateTask = useCallback(async () => {
        const oppId = liveWorkspaceVm?.scope.focusOpportunityId ?? selected?.opportunity_id ?? null;
        if (!oppId || !taskTitleDraft.trim()) {
            setTaskError("Link an opportunity before creating tasks.");
            return;
        }
        setTaskSaving(true);
        setTaskError(null);
        try {
            const dueIso = taskDueDraft ? new Date(taskDueDraft).toISOString() : new Date(Date.now() + 86400000).toISOString();
            const res = await createOperationalTask(
                buildOperationalTaskBody({ entityId: oppId, title: taskTitleDraft, dueAtIso: dueIso, source: "manual" })
            );
            const data = (await res.json()) as { error?: string };
            if (!res.ok) {
                setTaskError(data.error ?? "Failed to create task");
                return;
            }
            setTaskTitleDraft("");
            setTaskDueDraft("");
            await refreshWorkspace();
        } catch {
            setTaskError("Failed to create task");
        } finally {
            setTaskSaving(false);
        }
    }, [liveWorkspaceVm, selected, taskTitleDraft, taskDueDraft, refreshWorkspace]);

    const runCompleteTask = useCallback(
        async (taskId: string) => {
            setTaskSaving(true);
            setTaskError(null);
            try {
                const res = await patchOperationalTaskStatus(taskId, "completed");
                const data = (await res.json()) as { error?: string };
                if (!res.ok) {
                    setTaskError(data.error ?? "Failed to complete task");
                    return;
                }
                await refreshWorkspace();
            } catch {
                setTaskError("Failed to complete task");
            } finally {
                setTaskSaving(false);
            }
        },
        [refreshWorkspace]
    );

    const runTriage = useCallback(
        async (action: TriageActionKey) => {
            if (!selectedId) return;
            setTriageBusy(true);
            try {
                const res = await fetch(`/api/admin/communications/conversations/${encodeURIComponent(selectedId)}/triage`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action }),
                });
                if (!res.ok) return;
                await loadConversations({ background: true });
                setConversations((prev) =>
                    prev.map((c) =>
                        c.id === selectedId ?
                            {
                                ...c,
                                attention_state:
                                    action === "needs_review" ? null
                                    : action === "needs_response" ? "awaiting_parent_reply"
                                    : "resolved",
                            }
                        :   c
                    )
                );
            } finally {
                setTriageBusy(false);
            }
        },
        [selectedId, loadConversations]
    );

    const runPreferenceChange = useCallback(
        async (field: PreferenceFieldKey, status: "Allowed" | "Blocked") => {
            if (!primaryPersonId) return;
            setPreferenceSaving(true);
            try {
                const res = await fetch("/api/admin/communications/preferences", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ person_id: primaryPersonId, field, status }),
                });
                if (!res.ok) return;
                await refreshWorkspace();
            } finally {
                setPreferenceSaving(false);
            }
        },
        [primaryPersonId, refreshWorkspace]
    );

    const runFamilySend = useCallback(
        async (confirm: boolean) => {
            if (!LIVE_WORKSPACE) return;
            const cust = selectedCustomerId;
            if (!cust || selectedRecipientIds.length === 0 || !bodyDraft.trim()) return;
            setSending(true);
            setSendError(null);
            try {
                const res = await fetch("/api/admin/communications/family-send", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        customer_id: cust,
                        recipient_person_ids: selectedRecipientIds,
                        channel: liveChannel,
                        subject: subjectDraft,
                        body: bodyDraft,
                        reply_to_thread_id: selectedThreadId,
                        confirm,
                    }),
                });
                const data = (await res.json()) as (FamilySendResult & { error?: string });
                if (!res.ok) {
                    setSendError(data.error ?? "Send failed");
                    return;
                }
                setSendResult(data);
                if (confirm) {
                    await loadLive(cust, selectedThreadId ?? selectedId ?? "", false);
                }
            } catch {
                setSendError("Send failed");
            } finally {
                setSending(false);
            }
        },
        [loadLive, selectedCustomerId, selectedRecipientIds, subjectDraft, bodyDraft, selectedThreadId, liveChannel]
    );

    useEffect(() => {
        if (!LIVE_WORKSPACE || !selectedCustomerId || !selectedId) return;
        if (workspaceMode !== "email" && workspaceMode !== "sms") return;
        void loadLive(selectedCustomerId, selectedThreadId ?? selectedId, false, liveChannel);
    }, [workspaceMode, liveChannel, selectedCustomerId, selectedId, selectedThreadId, loadLive]);

    const filtered = useMemo(() => applyQueueFilters(conversations, filters), [conversations, filters]);
    const grouped = useMemo(() => groupConversationsByQueue(filtered), [filtered]);
    const queueSections = useMemo(() => visibleCommandCenterQueues(grouped), [grouped]);
    const visibleIds = useMemo(() => flattenVisibleConversationIds(queueSections), [queueSections]);
    const metrics = useMemo(() => computeCommandCenterMetrics(filtered), [filtered]);

    useEffect(() => {
        kpiContext?.setInboxKpis({
            metrics: {
                requiresResponse: metrics.requiresResponse,
                slaAtRisk: metrics.slaAtRisk,
                unread: metrics.unread,
                unclassified: metrics.unclassified,
            },
            loading,
        });
    }, [kpiContext, metrics, loading]);

    const detail: WorkspaceDetail | FixtureFamilyDetail | undefined =
        COMMS_FIXTURES_ENABLED && selected ? FIXTURE_FAMILY_DETAILS[selected.id] : liveWorkspaceDetail;
    const childNames = useMemo(
        () => {
            if (LIVE_WORKSPACE && liveChildren) return liveChildren;
            if (detail && "children" in detail && typeof detail.children === "string") {
                return detail.children.split(/\s*[&,]\s*/).map((s) => s.trim()).filter(Boolean);
            }
            return [];
        },
        [detail, liveChildren]
    );

    useEffect(() => {
        if (loading) return;
        const nextId = resolveCommandCenterSelection(selectedId, visibleIds);
        if (nextId && nextId !== selectedId) {
            void openConversation(nextId);
        } else if (!nextId && selectedId) {
            setSelectedId(null);
            setMessages([]);
            setLiveChildren(null);
            setLiveRecipientGroups(null);
        }
    }, [loading, visibleIds, selectedId, openConversation]);

    const timelineMessageCount = useMemo(
        () => messages.filter((m) => !m.kind || m.kind === "message").length,
        [messages]
    );
    const health = useMemo(
        () =>
            computeCommunicationHealth({
                messages: messages
                    .filter((m) => !m.kind || m.kind === "message")
                    .map((m) => ({ direction: m.direction, created_at: m.created_at, channel: m.channel, opened_at: m.opened_at, replied_at: m.replied_at })),
                unreadCount: selected?.unread ?? undefined,
            }),
        [messages, selected]
    );
    const healthDisplay = useMemo(
        () => resolveCommandCenterHealthDisplay(selected, timelineMessageCount, health.engagementScore),
        [selected, timelineMessageCount, health.engagementScore]
    );

    const queueUnresolved = loading && conversations.length === 0;
    const workspaceHydrating =
        !COMMS_FIXTURES_ENABLED &&
        filtered.length > 0 &&
        (loading || hydratingWorkspace || !selectedId) &&
        !selected;

    return (
        <div data-cc-shell="communications-command-center" className="relative flex min-h-0 flex-1 flex-col gap-2.5 bg-white p-2.5">
            {error ? <div className="text-[11px] text-alloy-ember">{error}</div> : null}

            {/* Outer split — queue ~25% | workspace ~75%. Outer modal/BOS geometry untouched. */}
            <div className="grid min-h-0 flex-1 grid-cols-[minmax(260px,25%)_minmax(0,1fr)] gap-2.5">
                {/* QUEUE */}
                <aside data-cc-column="queue" aria-label="Communication queue" className={`flex min-h-0 flex-col overflow-hidden ${COMMS_PANEL_SHELL_CLASS}`}>
                    <div className="shrink-0 border-b border-alloy-stone/12 px-3 py-2.5">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-alloy-midnight">Communication queue</span>
                            <span className="text-[11px] tabular-nums text-alloy-midnight/45">{filtered.length} families</span>
                        </div>
                        <div data-cc-filters className="mt-2 flex items-center gap-1.5">
                            <div className="relative shrink-0">
                                <select
                                    aria-label="Channel filter"
                                    value={filters.channel ?? ""}
                                    onChange={(e) => setFilters((f) => ({ ...f, channel: e.target.value || null }))}
                                    className={`appearance-none ${COMMS_FILTER_INPUT_CLASS} py-1 pl-2 pr-6`}
                                >
                                    <option value="">All channels</option>
                                    <option value="email">Email</option>
                                    <option value="sms">SMS</option>
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-alloy-midnight/40" />
                            </div>
                            <input
                                aria-label="Search families"
                                value={filters.search ?? ""}
                                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value || null }))}
                                placeholder="Search…"
                                className={`min-w-0 flex-1 ${COMMS_FILTER_INPUT_CLASS}`}
                            />
                            {loading ? <span className="shrink-0 text-[10px] text-alloy-midnight/45">…</span> : null}
                        </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto px-2.5 py-2.5">
                        {queueUnresolved ?
                            <CommsQueueListReserve />
                        :   queueSections.map((q) => {
                            const items = q.items;
                            const acc = attnAccent(q.key);
                            return (
                                <div key={q.key} data-cc-queue={q.key} className="mb-3.5">
                                    <div className="mb-1.5 flex items-center gap-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-alloy-midnight/40">
                                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${acc.dot}`} />
                                        <span>{q.label}</span>
                                        <span className="ml-auto tabular-nums">{items.length}</span>
                                    </div>
                                    <ul className="space-y-1.5">
                                        {items.map((c) => {
                                            const d = FIXTURE_FAMILY_DETAILS[c.id];
                                            const isSel = selectedId === c.id;
                                            const a = attnAccent(c.attention_state);
                                            const title = d ? (c.family_label ?? "Family") : conversationDisplayTitle(c);
                                            const subtitle = d ? `${d.children} · ${d.program}` : conversationDisplaySubtitle(c);
                                            const recipient = d ? null : conversationDisplayRecipient(c);
                                            const preview = d ? null : (c.last_message_preview ?? null);
                                            const unread = conversationUnreadCount(c);
                                            const statusPill = conversationQueueStatusPill(c);
                                            const activityAt = c.last_activity_at ?? c.last_message_at;
                                            const channelLabel = (c.channel ?? "").toLowerCase() === "sms" ? "SMS" : (c.channel ?? "").toLowerCase() === "email" ? "Email" : (c.channel ?? "");
                                            return (
                                                <li key={c.id}>
                                                    <button
                                                        type="button"
                                                        data-cc-conversation={c.id}
                                                        onClick={() => openConversation(c.id)}
                                                        className={`w-full rounded-xl border border-l-[3px] px-2.5 py-2 text-left transition ${
                                                            isSel
                                                                ? COMMS_LIST_ROW_SELECTED_CLASS
                                                                : `border-alloy-stone/15 ${a.rail} ${a.tint} hover:border-alloy-stone/30 hover:shadow-sm`
                                                        }`}
                                                    >
                                                        <div className="flex items-start justify-between gap-2">
                                                            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight text-alloy-midnight">{title}</span>
                                                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${queueStatusPillClass(statusPill.tone)}`}>{statusPill.label}</span>
                                                        </div>
                                                        {recipient ? (
                                                            <div className="mt-0.5 truncate text-[10px] text-alloy-midnight/45">{recipient}</div>
                                                        ) : null}
                                                        <div className="mt-1 truncate text-[11px] text-alloy-midnight/55">{subtitle}</div>
                                                        {preview ? (
                                                            <div className="mt-1 line-clamp-2 text-[10px] leading-snug text-alloy-midnight/50">{preview}</div>
                                                        ) : null}
                                                        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-alloy-midnight/45">
                                                            <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${a.dot}`} />
                                                            <span className="truncate">
                                                                {[channelLabel, activityAt ? relTime(activityAt) : null].filter(Boolean).join(" · ")}
                                                            </span>
                                                            <span className="ml-auto flex shrink-0 items-center gap-1.5">
                                                                {unread ? (
                                                                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-alloy-juniper px-1 text-[9px] font-bold text-white shadow-sm">{unread}</span>
                                                                ) : null}
                                                            </span>
                                                        </div>
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            );
                        })}
                        {!queueUnresolved && !loading && filtered.length === 0 ?
                            <div className="p-3 text-xs text-alloy-midnight/50">No families in the queue.</div>
                        :   null}
                    </div>
                </aside>

                {/* WORKSPACE — Conversation (context) | Composer (action) */}
                <section data-cc-column="workspace" data-cc-workspace="family-communication" aria-label="Family communication workspace" className={`flex min-h-0 flex-col overflow-hidden ${COMMS_PANEL_SHELL_CLASS}`}>
                    {selected ? (
                        <FamilyCommunicationWorkspaceView
                            selected={selected}
                            detail={detail}
                            childNames={childNames}
                            stageLabel={selected.stage_label ?? liveWorkspaceVm?.family.stage ?? detail?.stage ?? null}
                            healthTone={healthDisplay.tone}
                            healthDot={healthDisplay.dot}
                            healthLabel={healthDisplay.label}
                            recordLinks={recordLinks}
                            onOpenRecordLink={adminDrawer ? openRecordLink : undefined}
                            showClaim={ASSIGNMENT_ENABLED}
                            workspaceMode={workspaceMode}
                            onWorkspaceModeChange={setWorkspaceMode}
                            workspaceModeAvailability={workspaceModeAvailability}
                            relatedTasks={liveWorkspaceVm?.relatedTasks ?? []}
                            preferenceProfile={liveWorkspaceVm?.consentSummary.preferenceProfile}
                            canEditPreferences={LIVE_WORKSPACE && !!primaryPersonId}
                            preferenceSaving={preferenceSaving}
                            onPreferenceChange={(field, status) => void runPreferenceChange(field, status)}
                            attentionLabel={conversationAttentionLabel(selected.attention_state)}
                            onTriage={(action) => void runTriage(action)}
                            triageBusy={triageBusy}
                            noteDraft={noteDraft}
                            onNoteDraftChange={setNoteDraft}
                            onAddNote={() => void runAddNote()}
                            noteSaving={noteSaving}
                            noteError={noteError}
                            taskTitleDraft={taskTitleDraft}
                            taskDueDraft={taskDueDraft}
                            onTaskTitleChange={setTaskTitleDraft}
                            onTaskDueChange={setTaskDueDraft}
                            onCreateTask={() => void runCreateTask()}
                            onCompleteTask={(id) => void runCompleteTask(id)}
                            taskSaving={taskSaving}
                            taskError={taskError}
                            LIVE_WORKSPACE={LIVE_WORKSPACE}
                            selectedThreadId={selectedThreadId}
                            messages={messages}
                            liveRecipientGroups={liveRecipientGroups}
                            selectedRecipientIds={selectedRecipientIds}
                            liveChannel={liveChannel}
                            subjectDraft={subjectDraft}
                            bodyDraft={bodyDraft}
                            sendResult={sendResult}
                            sendError={sendError}
                            sending={sending}
                            assignBusy={assignBusy}
                            onClaim={(id) => claim(id)}
                            onAllMessages={() => { setSelectedThreadId(null); if (selectedCustomerId && selectedId) void loadLive(selectedCustomerId, selectedId, false); }}
                            onOpenThread={(t) => void openThread(t)}
                            onToggleRecipient={(id) => setSelectedRecipientIds((prev) => toggleRecipientSelection(prev, id, true))}
                            onSubjectChange={setSubjectDraft}
                            onBodyChange={setBodyDraft}
                            onSendNow={() => void runFamilySend(false)}
                            onConfirmSend={() => void runFamilySend(true)}
                            onDismissSend={() => { setSendResult(null); setSendError(null); }}
                        />
                    ) : workspaceHydrating ? (
                        <CommsWorkspacePanelReserve label="Loading first conversation" />
                    ) : !loading && filtered.length === 0 ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                            <p className="text-sm font-medium text-alloy-midnight/60">No conversations yet</p>
                            <p className="max-w-sm text-xs leading-relaxed text-alloy-midnight/45">
                                Conversations appear here when messages are sent or received.
                            </p>
                        </div>
                    ) : null}
                </section>
            </div>
        </div>
    );
}
