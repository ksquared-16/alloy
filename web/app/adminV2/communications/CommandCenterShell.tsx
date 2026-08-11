"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
    groupConversationsByQueue,
    computeCommandCenterMetrics,
    applyQueueFilters,
    visibleCommandCenterQueues,
    flattenVisibleConversationIds,
    flattenLoadableConversationIds,
    resolveCommandCenterSelectionPreferringLoadable,
    conversationDisplayTitle,
    conversationDisplayTopic,
    conversationDisplayChildren,
    conversationDisplayRecipient,
    conversationChannelLabel,
    conversationUnreadCount,
    conversationQueueStatusPill,
    queueStatusPillClass,
    countDistinctQueueFamilies,
    isQueueRowLoadable,
    resolveQueueWorkspaceError,
    prepareCommandCenterQueue,
    NEEDS_RESOLUTION_QUEUE_KEY,
    resolveCommandCenterHealthDisplay,
    type ConversationSummary,
    type CommandCenterFilters,
} from "@/lib/communications/v2/commandCenterViewModel";
import {
    getCommandCenterCacheSnapshot,
    getCommandCenterWarmSelectedConversationId,
    getCommandCenterPendingSelection,
    prefetchCommandCenterConversations,
    subscribeCommandCenterCache,
} from "@/lib/communications/v2/commandCenterPrefetchCache";
import { buildCommandCenterRecordLinks, type CommandCenterRecordLink } from "@/lib/communications/v2/commandCenterRecordLinks";
import { relTime } from "@/lib/communications/v2/familyWorkspace/timelinePresentation";
import FamilyCommunicationWorkspaceView, { type WorkspaceDetail } from "@/app/adminV2/communications/FamilyCommunicationWorkspaceView";
import UnidentifiedConversationPanel, {
    isUnidentifiedConversation,
} from "@/app/adminV2/communications/UnidentifiedConversationPanel";
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
import { useAdminAuthOptional } from "@/contexts/AdminAuthContext";
import { useFamilyCommunicationRuntime } from "@/lib/communications/v2/familyWorkspace/useFamilyCommunicationRuntime";
import { conversationAttentionLabel, type TriageActionKey } from "@/lib/communications/v2/conversationTriage";
import ViewInWorkItemsLink from "@/components/workItems/ViewInWorkItemsLink";
import {
    communicationWorkItemId,
    conversationRequiresReplyForWorkItemProjection,
} from "@/lib/workItems/mapCommunicationThreadToWorkItemRow";
import { dispatchOperationalWorkRefresh } from "@/lib/workItems/operationalWorkRefresh";
import type { WorkItemViewKey } from "@/lib/workItems/workItemQueueScope";
import type { PreferenceFieldKey } from "@/lib/communications/v2/communicationPreferenceLabels";
import {
    buildOperationalTaskBody,
    createOperationalTask,
    patchOperationalTaskStatus,
} from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import {
    COMMS_FIXTURES_ENABLED,
    FIXTURE_CONVERSATIONS,
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

function initialConversations(): ConversationSummary[] {
    if (COMMS_FIXTURES_ENABLED) return FIXTURE_CONVERSATIONS;
    const cached = getCommandCenterCacheSnapshot()?.conversations;
    return cached ? prepareCommandCenterQueue(cached) : [];
}

function initialSelectedId(): string | null {
    if (COMMS_FIXTURES_ENABLED) return FIXTURE_CONVERSATIONS[0]?.id ?? null;
    return getCommandCenterWarmSelectedConversationId();
}

function initialLoading(): boolean {
    if (COMMS_FIXTURES_ENABLED) return false;
    return !getCommandCenterCacheSnapshot();
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


function resolveCommunicationsWorkItemsView(
    conversation: ConversationSummary,
    viewerUserId: string | null | undefined,
): WorkItemViewKey {
    const assigned = conversation.assignment_state === "assigned" ? conversation.assigned_user_id?.trim() : null;
    if (assigned && viewerUserId?.trim() && assigned === viewerUserId.trim()) return "mine";
    return "unassigned";
}


const LIVE_WORKSPACE = isCommsV2FlagEnabled("comms_v2_live_workspace");
const ASSIGNMENT_ENABLED = isCommsV2FlagEnabled("comms_v2_assignment");

export default function CommandCenterShell() {
    const adminDrawer = useAdminDrawerOptional();
    const adminAuth = useAdminAuthOptional();
    const kpiContext = useCommunicationsWorkspaceKpiOptional();
    const [conversations, setConversations] = useState<ConversationSummary[]>(initialConversations);
    const [loading, setLoading] = useState(initialLoading);
    const [error, setError] = useState<string | null>(null);
    const [filters, setFilters] = useState<CommandCenterFilters>({});
    const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
    const [assignBusy, setAssignBusy] = useState(false);
    const [noteDraft, setNoteDraft] = useState("");
    const [noteSaving, setNoteSaving] = useState(false);
    const [noteError, setNoteError] = useState<string | null>(null);
    const [taskTitleDraft, setTaskTitleDraft] = useState("");
    const [taskDueDraft, setTaskDueDraft] = useState("");
    const [taskSaving, setTaskSaving] = useState(false);
    const [taskError, setTaskError] = useState<string | null>(null);
    const [preferenceSaving, setPreferenceSaving] = useState(false);
    const [triageBusy, setTriageBusy] = useState(false);

    const selected = useMemo(() => conversations.find((c) => c.id === selectedId) ?? null, [conversations, selectedId]);
    const selectedLoadable = useMemo(() => isQueueRowLoadable(selected), [selected]);
    const selectedCustomerId = useMemo(() => {
        if (!selectedLoadable) return null;
        if (COMMS_FIXTURES_ENABLED && selectedId) return FIXTURE_FAMILY_DETAILS[selectedId]?.customerId ?? null;
        return selected?.customer_id ?? null;
    }, [selectedLoadable, selected, selectedId]);
    const selectedEntity = useMemo(() => {
        if (!selectedLoadable || selectedCustomerId) return undefined;
        const entityType = selected?.primary_entity_type?.trim();
        const entityId = selected?.primary_entity_id?.trim();
        if (!entityType || !entityId) return undefined;
        return { entityType, entityId };
    }, [selectedLoadable, selectedCustomerId, selected?.primary_entity_type, selected?.primary_entity_id]);
    const runtime = useFamilyCommunicationRuntime({
        customerId: LIVE_WORKSPACE && selectedLoadable ? selectedCustomerId ?? undefined : undefined,
        entity: LIVE_WORKSPACE && selectedLoadable ? selectedEntity : undefined,
        initialThreadId: selectedLoadable ? selectedId : null,
        surfaceVariant: "workspace_inbox",
    });

    const refreshOperationalCommunicationsWork = useCallback((threadId: string | null | undefined) => {
        dispatchOperationalWorkRefresh({
            communication_thread_id: threadId ?? null,
            kind: "communications_reply",
        });
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
            setConversations(prepareCommandCenterQueue(snap.conversations));
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
            if (snap) setConversations(prepareCommandCenterQueue(snap.conversations));
            const pending = getCommandCenterPendingSelection();
            if (pending) {
                setSelectedId(pending);
                return;
            }
            setSelectedId((prev) => prev ?? getCommandCenterWarmSelectedConversationId());
        });
    }, []);

    useEffect(() => {
        void loadConversations({ background: !!getCommandCenterCacheSnapshot() });
    }, [loadConversations]);

    const openConversation = useCallback((id: string) => {
        setSelectedId(id);
    }, []);

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
                await loadConversations({ background: true });
                refreshOperationalCommunicationsWork(id);
            } finally {
                setAssignBusy(false);
            }
        },
        [loadConversations, refreshOperationalCommunicationsWork]
    );

    const recordLinks = useMemo((): CommandCenterRecordLink[] => {
        if (!selected) return [];
        const childLinks =
            runtime.vm?.children.map((c) => ({ id: c.id, name: c.name })) ??
            selected.child_links ??
            null;
        const stageDisplay = selected.stage_label ?? runtime.vm?.family.stage ?? null;
        return buildCommandCenterRecordLinks(selected, childLinks).map((link) =>
            link.type === "opportunities" && stageDisplay ? { ...link, label: stageDisplay } : link
        );
    }, [selected, runtime.vm]);

    const openRecordLink = useCallback(
        (link: CommandCenterRecordLink) => {
            if (!adminDrawer) return;
            adminDrawer.openDrawer({ type: link.type, id: link.id });
        },
        [adminDrawer]
    );

    const primaryPersonId = useMemo(() => {
        const primary = runtime.vm?.recipientGroups.flatMap((g) => g.recipients).find((r) => r.isPrimary);
        return primary?.id ?? runtime.vm?.selectedRecipients[0] ?? selected?.primary_contact_person_id ?? null;
    }, [runtime.vm, selected]);

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
                    opportunity_id: runtime.vm?.scope.focusOpportunityId ?? selected?.opportunity_id ?? null,
                    person_id: primaryPersonId,
                }),
            });
            const data = (await res.json()) as { error?: string };
            if (!res.ok) {
                setNoteError(data.error ?? "Failed to save note");
                return;
            }
            setNoteDraft("");
            await runtime.refreshCurrent();
        } catch {
            setNoteError("Failed to save note");
        } finally {
            setNoteSaving(false);
        }
    }, [LIVE_WORKSPACE, selectedCustomerId, noteDraft, runtime, selected, primaryPersonId]);

    const runCreateTask = useCallback(async () => {
        const oppId = runtime.vm?.scope.focusOpportunityId ?? selected?.opportunity_id ?? null;
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
            await runtime.refreshCurrent();
        } catch {
            setTaskError("Failed to create task");
        } finally {
            setTaskSaving(false);
        }
    }, [runtime, selected, taskTitleDraft, taskDueDraft]);

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
                await runtime.refreshCurrent();
            } catch {
                setTaskError("Failed to complete task");
            } finally {
                setTaskSaving(false);
            }
        },
        [runtime]
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
                refreshOperationalCommunicationsWork(selectedId);
            } finally {
                setTriageBusy(false);
            }
        },
        [selectedId, loadConversations, refreshOperationalCommunicationsWork]
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
                await runtime.refreshCurrent();
            } finally {
                setPreferenceSaving(false);
            }
        },
        [primaryPersonId, runtime]
    );

    const filtered = useMemo(() => applyQueueFilters(conversations, filters), [conversations, filters]);
    const grouped = useMemo(() => groupConversationsByQueue(filtered), [filtered]);
    const queueSections = useMemo(() => visibleCommandCenterQueues(grouped), [grouped]);
    const visibleIds = useMemo(() => flattenVisibleConversationIds(queueSections), [queueSections]);
    const loadableIds = useMemo(() => flattenLoadableConversationIds(queueSections), [queueSections]);
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
        COMMS_FIXTURES_ENABLED && selected ? FIXTURE_FAMILY_DETAILS[selected.id] : runtime.detail;
    const childNames = useMemo(
        () => {
            if (LIVE_WORKSPACE && runtime.childNames.length > 0) return runtime.childNames;
            if (detail && "children" in detail && typeof detail.children === "string") {
                return detail.children.split(/\s*[&,]\s*/).map((s) => s.trim()).filter(Boolean);
            }
            return [];
        },
        [detail, runtime.childNames]
    );

    useEffect(() => {
        if (loading) return;
        const nextId = resolveCommandCenterSelectionPreferringLoadable(selectedId, visibleIds, loadableIds);
        if (nextId && nextId !== selectedId) {
            void openConversation(nextId);
        } else if (!nextId && selectedId) {
            setSelectedId(null);
        }
    }, [loading, visibleIds, loadableIds, selectedId, openConversation]);

    const lastSendCompleteToken = useRef(0);
    useEffect(() => {
        const token = runtime.sendCompleteToken;
        if (!token || token === lastSendCompleteToken.current) return;
        lastSendCompleteToken.current = token;
        refreshOperationalCommunicationsWork(selectedId);
    }, [refreshOperationalCommunicationsWork, runtime.sendCompleteToken, selectedId]);

    const workspaceError = useMemo(
        () => resolveQueueWorkspaceError(selected, runtime.error),
        [selected, runtime.error]
    );

    const timelineMessageCount = useMemo(
        () => runtime.messages.filter((m) => !m.kind || m.kind === "message").length,
        [runtime.messages]
    );
    const healthDisplay = useMemo(
        () => resolveCommandCenterHealthDisplay(selected, timelineMessageCount, runtime.vm?.healthSummary.engagementScore ?? 0),
        [selected, timelineMessageCount, runtime.vm?.healthSummary.engagementScore]
    );

    const queueUnresolved = loading && conversations.length === 0;
    const workspaceHydrating =
        !COMMS_FIXTURES_ENABLED &&
        filtered.length > 0 &&
        (loading || !selectedId) &&
        !selected;
    const workspaceLoading = Boolean(
        selected && selectedLoadable && (runtime.loading || (!runtime.vm && !runtime.error))
    );
    const distinctFamilyCount = useMemo(() => countDistinctQueueFamilies(filtered), [filtered]);

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
                            <span className="text-[11px] tabular-nums text-alloy-midnight/45">{distinctFamilyCount} families</span>
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
                            const isReviewQueue = q.key === NEEDS_RESOLUTION_QUEUE_KEY;
                            const acc = isReviewQueue
                                ? { dot: "bg-alloy-amber", rail: "border-l-alloy-amber", tint: "bg-alloy-amber/8" }
                                : attnAccent(q.key);
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
                                            const rowAccent = isReviewQueue
                                                ? { dot: "bg-alloy-amber", rail: "border-l-alloy-amber", tint: "bg-alloy-amber/8" }
                                                : attnAccent(c.attention_state);
                                            const familyName = d ? (c.family_label ?? "Household") : conversationDisplayTitle(c);
                                            const topicLabel = d ? (c.topic_label ?? d.program) : conversationDisplayTopic(c);
                                            const childrenLabel = d ? d.children : conversationDisplayChildren(c);
                                            const contactLabel = d ? null : conversationDisplayRecipient(c);
                                            const preview = d ? null : (c.last_message_preview ?? null);
                                            const unread = conversationUnreadCount(c);
                                            const statusPill = conversationQueueStatusPill(c);
                                            const activityAt = c.last_activity_at ?? c.last_message_at;
                                            const channelLabel = conversationChannelLabel(c.channel);
                                            const attentionLabel = conversationAttentionLabel(c.attention_state);
                                            return (
                                                <li key={c.id}>
                                                    <button
                                                        type="button"
                                                        data-cc-conversation={c.id}
                                                        onClick={() => openConversation(c.id)}
                                                        className={`w-full rounded-xl border border-l-[3px] px-2.5 py-2 text-left transition ${
                                                            isSel
                                                                ? COMMS_LIST_ROW_SELECTED_CLASS
                                                                : `border-alloy-stone/15 ${rowAccent.rail} ${rowAccent.tint} hover:border-alloy-stone/30 hover:shadow-sm`
                                                        }`}
                                                    >
                                                        <div className="flex items-start justify-between gap-2">
                                                            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight text-alloy-midnight">{familyName}</span>
                                                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${queueStatusPillClass(statusPill.tone)}`}>{statusPill.label}</span>
                                                        </div>
                                                        <div className="mt-0.5 truncate text-[11px] font-medium text-alloy-midnight/70">{topicLabel}</div>
                                                        {childrenLabel ? (
                                                            <div className="mt-0.5 truncate text-[10px] text-alloy-midnight/45">{childrenLabel}</div>
                                                        ) : contactLabel ? (
                                                            <div className="mt-0.5 truncate text-[10px] text-alloy-midnight/45">{contactLabel}</div>
                                                        ) : null}
                                                        {preview ? (
                                                            <div className="mt-1 line-clamp-2 text-[10px] leading-snug text-alloy-midnight/50">{preview}</div>
                                                        ) : null}
                                                        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-alloy-midnight/45">
                                                            <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${rowAccent.dot}`} />
                                                            <span className="truncate">
                                                                {[channelLabel, activityAt ? relTime(activityAt) : null, attentionLabel].filter(Boolean).join(" · ")}
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
                    {selected && conversationRequiresReplyForWorkItemProjection(selected) ?
                        <div className="flex shrink-0 justify-end border-b border-alloy-stone/12 px-3 py-1.5">
                            <ViewInWorkItemsLink
                                taskId={communicationWorkItemId(selected.id)}
                                opportunityId={selected.opportunity_id ?? null}
                                source="communications"
                                view={resolveCommunicationsWorkItemsView(selected, adminAuth?.userId ?? null)}
                                className="inline-flex items-center gap-1 rounded-md border border-alloy-stone/22 bg-white px-2 py-1 text-[10px] font-semibold text-alloy-juniper hover:bg-alloy-juniper/[0.05]"
                            />
                        </div>
                    :   null}
                    {/*
                      * `selectedLoadable` is load-bearing, not belt-and-braces. The
                      * runtime keeps the last household's view model when the new
                      * selection has no customer, so switching from a family
                      * conversation to an unidentified one left this branch matching
                      * on STALE `runtime.vm` — the previous family's name, children,
                      * preferences and history rendered under a different
                      * conversation. Requiring the selection to be the one the view
                      * model actually describes is what makes the two mutually
                      * exclusive.
                      */}
                    {selected && selectedLoadable && runtime.vm ? (
                        <FamilyCommunicationWorkspaceView
                            surfaceVariant="workspace_inbox"
                            selected={selected}
                            detail={detail}
                            childNames={childNames}
                            stageLabel={selected.stage_label ?? runtime.vm.family.stage ?? detail?.stage ?? null}
                            healthTone={healthDisplay.tone}
                            healthDot={healthDisplay.dot}
                            healthLabel={healthDisplay.label}
                            recordLinks={recordLinks}
                            onOpenRecordLink={adminDrawer ? openRecordLink : undefined}
                            showClaim={ASSIGNMENT_ENABLED}
                            workspaceMode={runtime.workspaceMode}
                            onWorkspaceModeChange={runtime.setWorkspaceMode}
                            workspaceModeAvailability={runtime.workspaceModeAvailability}
                            relatedTasks={runtime.vm.relatedTasks ?? []}
                            preferenceProfile={runtime.vm.consentSummary.preferenceProfile}
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
                            selectedThreadId={runtime.selectedThreadId}
                            selectedThread={runtime.selectedThread}
                            messages={runtime.messages}
                            timelineMessages={runtime.timelineMessages}
                            liveRecipientGroups={runtime.vm.recipientGroups}
                            selectedRecipientIds={runtime.selectedRecipientIds}
                            liveChannel={runtime.liveChannel}
                            subjectDraft={runtime.subjectDraft}
                            bodyDraft={runtime.bodyDraft}
                            sendResult={runtime.sendResult}
                            sendError={runtime.sendError}
                            sending={runtime.sending}
                            assignBusy={assignBusy}
                            onClaim={(id) => claim(id)}
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
                    ) : selected && isUnidentifiedConversation(selected) ? (
                        // Ordered BEFORE the workspace-error branch deliberately.
                        // `resolveCommandCenterWorkspaceError` answers "Not linked to a
                        // family yet — review the connection before replying" for every
                        // unresolved or ambiguous conversation, which is true and is a
                        // dead end: a real parent's message, received and retained, with
                        // no way to answer it. Not being linked to a household is a fact
                        // about routing, not a reason to leave someone unanswered.
                        <UnidentifiedConversationPanel
                            conversation={selected}
                            onReplied={() => refreshOperationalCommunicationsWork(selected.id)}
                        />
                    ) : workspaceLoading ? (
                        <CommsWorkspacePanelReserve label="Loading conversation" />
                    ) : workspaceError ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                            <p className="text-sm font-medium text-alloy-ember">{workspaceError.title}</p>
                            <p className="max-w-sm text-xs leading-relaxed text-alloy-midnight/45">{workspaceError.message}</p>
                            {workspaceError.canRetry ? (
                                <button
                                    type="button"
                                    onClick={() => void runtime.refreshCurrent()}
                                    className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-1.5 text-xs font-medium text-alloy-midnight/70 shadow-sm transition hover:border-alloy-stone/40"
                                >
                                    Retry
                                </button>
                            ) : null}
                        </div>
                    ) : workspaceHydrating ? (
                        <CommsWorkspacePanelReserve label="Loading first conversation" />
                    ) : selected ? (
                        <CommsWorkspacePanelReserve label="Loading conversation" />
                    ) : !loading && filtered.length === 0 ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
                            <p className="text-sm font-medium text-alloy-midnight/60">No conversations yet</p>
                            <p className="max-w-sm text-xs leading-relaxed text-alloy-midnight/45">
                                Conversations appear here when messages are sent or received.
                            </p>
                        </div>
                    ) : (
                        <CommsWorkspacePanelReserve label="Loading conversation" />
                    )}
                </section>
            </div>
        </div>
    );
}
