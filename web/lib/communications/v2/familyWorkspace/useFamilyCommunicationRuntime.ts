"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeCommunicationHealth } from "@/lib/communications/v2/communicationHealth";
import { toggleRecipientSelection } from "@/lib/communications/v2/familyWorkspace/composerSelection";
import type {
    ComposerChannel,
    FamilyCommunicationWorkspacePreviewVM,
    FamilyCommunicationWorkspaceVM,
    PersonPreferenceProfile,
    TimelineEventVM,
} from "@/lib/communications/v2/familyWorkspace/types";
import type { FamilySendResult } from "@/lib/communications/v2/familyWorkspace/orchestrateFamilySend";
import {
    getDrawerFamilyWorkspaceInflight,
    getDrawerFamilyWorkspaceWarm,
    invalidateDrawerFamilyWorkspaceCache,
    prefetchDrawerFamilyWorkspace,
    subscribeDrawerFamilyWorkspaceCache,
    type DrawerFamilyWorkspacePrefetchParams,
} from "@/lib/communications/v2/drawerFamilyWorkspacePrefetchCache";
import { markDrawerFamilyWorkspaceTiming } from "@/lib/communications/v2/drawerFamilyWorkspacePrefetchTiming";
import {
    resolveWorkspaceModeAvailability,
    type WorkspaceMode,
} from "@/lib/communications/v2/workspaceModeAvailability";
import {
    deriveThreadReplyRecipientIds,
    threadChannelToWorkspaceMode,
} from "@/lib/communications/v2/familyWorkspace/threadTopicPresentation";
import type { FamilyWorkspaceSurfaceVariant } from "@/lib/communications/v2/familyWorkspace/surfaceVariant";
import { dispatchOpportunityDrawerScopedUpdate } from "@/lib/admin/opportunityDrawerTargetedRefresh";
import { dispatchOperationalWorkRefresh } from "@/lib/workItems/operationalWorkRefresh";
import {
    buildContactFamilySendSuccessMessage,
    dispatchContactFamilySendComplete,
} from "@/lib/communications/v2/familyWorkspace/contactFamilySendComplete";

export type FamilyRuntimeTimelineMessage = {
    id?: string | null;
    direction?: string | null;
    channel?: string | null;
    body?: string | null;
    created_at?: string | null;
    kind?: string | null;
    thread_id?: string | null;
    status?: string | null;
    recipient_person_id?: string | null;
    sender_user_id?: string | null;
    sender_display_name?: string | null;
    opened_at?: string | null;
    delivered_at?: string | null;
};

const UNSET_PREFERENCE_PROFILE: PersonPreferenceProfile = {
    email_transactional: "unset",
    sms_transactional: "unset",
    email_marketing: "unset",
    sms_marketing: "unset",
};

export function familyWorkspaceFromPreview(
    preview: FamilyCommunicationWorkspacePreviewVM
): FamilyCommunicationWorkspaceVM {
    const contactIds = [...preview.eligibleRecipients, ...preview.disabledRecipients].map((r) => r.id);
    const byContact = Object.fromEntries(
        contactIds.map((id) => [id, { email: "unset" as const, sms: "unset" as const, marketing: "unset" as const }])
    );
    return {
        family: preview.family,
        children: preview.children,
        recipientGroups: preview.recipientGroups,
        eligibleRecipients: preview.eligibleRecipients,
        disabledRecipients: preview.disabledRecipients,
        selectedRecipients: preview.selectedRecipients,
        consentSummary: {
            byContact,
            household: { email: "unset", sms: "unset", marketing: "unset" },
            preferenceProfile: UNSET_PREFERENCE_PROFILE,
            displayFlags: { email: true, sms: true, marketing: true },
        },
        composerDraft: preview.composerDraft,
        scope: preview.scope,
        threads: preview.recentThreads,
        selectedThread: null,
        messages: [],
        timelineEvents: preview.recentTimelineEvents,
        healthSummary: {
            status: "healthy",
            engagementScore: 66,
            responseRate: null,
            lastContactAt: preview.recentTimelineEvents.at(-1)?.createdAt ?? null,
            unreadCount: 0,
        },
        relatedTasks: [],
    };
}

export function toFamilyRuntimeTimelineMessage(e: TimelineEventVM): FamilyRuntimeTimelineMessage {
    return {
        id: e.id,
        direction: e.direction,
        channel: e.channel,
        body: e.body,
        created_at: e.createdAt,
        kind: e.kind,
        thread_id: e.threadId,
        status: e.status,
        recipient_person_id: e.recipientPersonId ?? null,
        sender_user_id: e.senderUserId ?? null,
        sender_display_name: e.senderDisplayName ?? null,
        opened_at: e.openedAt ?? null,
        delivered_at: e.deliveredAt ?? null,
    };
}

const toThreadPreviewMessage = (e: TimelineEventVM) => ({
    thread_id: e.threadId,
    body: e.body,
    created_at: e.createdAt,
    kind: e.kind,
    direction: e.direction,
    recipient_person_id: e.recipientPersonId ?? null,
});

export function resolveFamilyRuntimePrefetchParams(
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

export function resolveFamilyRuntimeInvalidateScope(props: {
    customerId?: string;
    entity?: { entityType: string; entityId: string };
}): { customerId?: string; entityType?: string; entityId?: string } | undefined {
    if (props.customerId) return { customerId: props.customerId };
    if (props.entity?.entityId) {
        return { entityType: props.entity.entityType, entityId: props.entity.entityId };
    }
    return undefined;
}

function resolveLoadComposerChannel(
    threadId: string | null,
    workspace: FamilyCommunicationWorkspaceVM | null,
    fallback: ComposerChannel,
): ComposerChannel {
    if (!threadId || !workspace) return fallback;
    const thread = workspace.threads.find((t) => t.id === threadId);
    if (!thread) return fallback;
    return threadChannelToWorkspaceMode(thread.channel) === "sms" ? "sms" : "email";
}

export type FamilyCommunicationRuntimeInput = {
    customerId?: string;
    entity?: { entityType: string; entityId: string };
    channel?: "email" | "sms";
    initialPreviewVm?: FamilyCommunicationWorkspacePreviewVM | null;
    initialThreadId?: string | null;
    surfaceVariant?: FamilyWorkspaceSurfaceVariant;
    compactActivityLoading?: boolean;
    /**
     * When `current_work`, a successful confirm-send returns to What's Next
     * (no auto thread open) and completes Contact Family via the server seam.
     */
    entryContext?: "current_work" | null;
};

export function useFamilyCommunicationRuntime(input: FamilyCommunicationRuntimeInput) {
    const surfaceVariant = input.surfaceVariant ?? "default";
    const isActivityEmbed = surfaceVariant === "activity_embed";
    const isThreadScopedSurface = surfaceVariant === "activity_embed" || surfaceVariant === "workspace_inbox";
    const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(() =>
        input.channel === "sms" ? "sms" : "email",
    );
    const liveChannel: ComposerChannel = workspaceMode === "sms" ? "sms" : "email";
    const initialThreadId = input.initialThreadId ?? null;
    const initialPrefetchParams = useMemo(
        () => resolveFamilyRuntimePrefetchParams(input, liveChannel, initialThreadId),
        [input.customerId, input.entity?.entityType, input.entity?.entityId, liveChannel, initialThreadId]
    );
    const [vm, setVm] = useState<FamilyCommunicationWorkspaceVM | null>(() => {
        const warm = initialPrefetchParams ? getDrawerFamilyWorkspaceWarm(initialPrefetchParams) : null;
        const familyParams = initialPrefetchParams ? { ...initialPrefetchParams, threadId: null } : null;
        const familyWarm =
            !warm && initialThreadId && familyParams
                ? getDrawerFamilyWorkspaceWarm(familyParams)
                : null;
        if (warm || familyWarm) return warm ?? familyWarm;
        return input.initialPreviewVm ? familyWorkspaceFromPreview(input.initialPreviewVm) : null;
    });
    const [loading, setLoading] = useState(() => !vm);
    const [servedFromWarmCache, setServedFromWarmCache] = useState(() => Boolean(vm));
    const [error, setError] = useState<string | null>(null);
    const [selectedThreadId, setSelectedThreadId] = useState<string | null>(initialThreadId);
    const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>(() => vm?.selectedRecipients ?? []);
    const [subjectDraft, setSubjectDraft] = useState("");
    const [bodyDraft, setBodyDraft] = useState("");
    const [sendResult, setSendResult] = useState<FamilySendResult | null>(null);
    const [sendError, setSendError] = useState<string | null>(null);
    const [sending, setSending] = useState(false);
    const [sendCompleteToken, setSendCompleteToken] = useState(0);
    const mountedRef = useRef(false);
    const activityEmbedBootstrappedRef = useRef(false);
    const hasUserThreadSelectionRef = useRef(false);
    const loadRequestSeqRef = useRef(0);
    const selectedThreadIdRef = useRef<string | null>(selectedThreadId);
    selectedThreadIdRef.current = selectedThreadId;
    const familyScopeKey = useMemo(
        () => `${input.customerId ?? ""}|${input.entity?.entityType ?? ""}|${input.entity?.entityId ?? ""}|${initialThreadId ?? ""}`,
        [input.customerId, input.entity?.entityType, input.entity?.entityId, initialThreadId],
    );

    const syncThreadContext = useCallback(
        (threadId: string | null, workspace: FamilyCommunicationWorkspaceVM) => {
            if (!isThreadScopedSurface) return;
            if (!threadId) {
                setSelectedRecipientIds(workspace.selectedRecipients);
                return;
            }
            const thread = workspace.threads.find((t) => t.id === threadId);
            if (!thread) return;
            setWorkspaceMode(threadChannelToWorkspaceMode(thread.channel));
            const threadMessages = workspace.timelineEvents.filter((e) => e.threadId === threadId).map(toThreadPreviewMessage);
            const recipientIds = deriveThreadReplyRecipientIds(thread, threadMessages);
            if (recipientIds.length > 0) setSelectedRecipientIds(recipientIds);
        },
        [isThreadScopedSurface],
    );

    useEffect(() => {
        if (mountedRef.current) return;
        mountedRef.current = true;
        markDrawerFamilyWorkspaceTiming("workspace_mounted", {
            entity_type: input.entity?.entityType,
            entity_id: input.entity?.entityId,
            customer_id: input.customerId,
            compact_activity: input.compactActivityLoading ?? false,
        });
        const params = resolveFamilyRuntimePrefetchParams(input, liveChannel, initialThreadId);
        markDrawerFamilyWorkspaceTiming(
            params && (getDrawerFamilyWorkspaceWarm(params) || input.initialPreviewVm) ? "warm_cache_hit" : "warm_cache_miss",
            {
                entity_type: input.entity?.entityType,
                entity_id: input.entity?.entityId,
                customer_id: input.customerId,
                source: params && getDrawerFamilyWorkspaceWarm(params) ? "full_cache" : input.initialPreviewVm ? "preview_vm" : "miss",
            }
        );
    }, [liveChannel, input.customerId, input.entity?.entityType, input.entity?.entityId, input.compactActivityLoading, input.initialPreviewVm, initialThreadId]);

    const applyWorkspace = useCallback((workspace: FamilyCommunicationWorkspaceVM, resetSelection: boolean) => {
        setVm(workspace);
        if (resetSelection) setSelectedRecipientIds(workspace.selectedRecipients);
        setError(null);
    }, []);

    const load = useCallback(
        async (
            threadId: string | null,
            resetSelection: boolean,
            opts?: { force?: boolean; channel?: ComposerChannel },
        ) => {
            const requestSeq = ++loadRequestSeqRef.current;
            const requestThreadId = threadId;
            const channel = opts?.channel ?? resolveLoadComposerChannel(threadId, vm, liveChannel);
            const shouldApply = () => {
                if (requestSeq !== loadRequestSeqRef.current) return false;
                if (isThreadScopedSurface && requestThreadId !== selectedThreadIdRef.current) return false;
                return true;
            };
            const applyIfCurrent = (workspace: FamilyCommunicationWorkspaceVM, reset: boolean) => {
                if (!shouldApply()) return;
                applyWorkspace(workspace, reset);
            };

            const params = resolveFamilyRuntimePrefetchParams(input, channel, threadId);
            if (!params) {
                if (shouldApply()) setLoading(false);
                return null;
            }

            const warm = !opts?.force ? getDrawerFamilyWorkspaceWarm(params) : null;
            if (warm) {
                applyIfCurrent(warm, resetSelection);
                if (shouldApply()) {
                    setLoading(false);
                    setServedFromWarmCache(true);
                }
                // SWR revalidate: coalesce onto an in-flight fetch when one exists so two
                // consumers served from the same warm entry don't each issue a forced request
                // (the `force` flag intentionally bypasses warm freshness, not in-flight dedup).
                const revalidate =
                    getDrawerFamilyWorkspaceInflight(params) ??
                    prefetchDrawerFamilyWorkspace(params, { force: true });
                void revalidate.then((fresh) => {
                    if (fresh) applyIfCurrent(fresh, resetSelection);
                });
                return warm;
            }

            if (shouldApply()) {
                setLoading(true);
                setError(null);
            }
            try {
                const pending = !opts?.force ? getDrawerFamilyWorkspaceInflight(params) : null;
                const workspace = pending ? await pending : await prefetchDrawerFamilyWorkspace(params, opts);
                if (!workspace) {
                    if (shouldApply()) setError("Failed to load");
                    return null;
                }
                applyIfCurrent(workspace, resetSelection);
                return workspace;
            } catch {
                if (shouldApply()) setError("Failed to load");
                return null;
            } finally {
                if (shouldApply()) setLoading(false);
            }
        },
        [applyWorkspace, input.customerId, input.entity?.entityType, input.entity?.entityId, isThreadScopedSurface, liveChannel, vm]
    );

    const loadRef = useRef(load);
    loadRef.current = load;

    useEffect(() => {
        loadRequestSeqRef.current += 1;
        hasUserThreadSelectionRef.current = Boolean(initialThreadId);
        setSelectedThreadId(initialThreadId);
        selectedThreadIdRef.current = initialThreadId;
        setSubjectDraft("");
        setBodyDraft("");
        setSendResult(null);
        setSendError(null);
        activityEmbedBootstrappedRef.current = false;
        const params = resolveFamilyRuntimePrefetchParams(input, liveChannel, initialThreadId);
        const warm = params ? getDrawerFamilyWorkspaceWarm(params) : null;
        setServedFromWarmCache(Boolean(warm || input.initialPreviewVm));
        void loadRef.current(initialThreadId, true);
        // Scope reset only — must not re-run when liveChannel/load identity changes (thread switch).
    }, [familyScopeKey, input.initialPreviewVm]);

    useEffect(() => {
        const params = resolveFamilyRuntimePrefetchParams(input, liveChannel, selectedThreadId);
        if (!params || vm) return;
        return subscribeDrawerFamilyWorkspaceCache(() => {
            const warm = getDrawerFamilyWorkspaceWarm(params);
            if (!warm) return;
            applyWorkspace(warm, true);
            setLoading(false);
            setServedFromWarmCache(true);
        });
    }, [
        applyWorkspace,
        liveChannel,
        input.customerId,
        input.entity?.entityType,
        input.entity?.entityId,
        selectedThreadId,
        vm,
    ]);

    const openThread = useCallback((threadId: string) => {
        hasUserThreadSelectionRef.current = true;
        setSelectedThreadId(threadId);
        selectedThreadIdRef.current = threadId;
        setBodyDraft("");
        setSendResult(null);
        setSendError(null);
        const channel = resolveLoadComposerChannel(threadId, vm, liveChannel);
        if (vm) syncThreadContext(threadId, vm);
        void load(threadId, false, { channel });
    }, [load, liveChannel, syncThreadContext, vm]);

    useEffect(() => {
        if (!isThreadScopedSurface || !vm || !selectedThreadId) return;
        syncThreadContext(selectedThreadId, vm);
    }, [isThreadScopedSurface, selectedThreadId, syncThreadContext, vm]);

    useEffect(() => {
        if (!isActivityEmbed || !vm || activityEmbedBootstrappedRef.current) return;
        if (initialThreadId || hasUserThreadSelectionRef.current || selectedThreadId) return;
        activityEmbedBootstrappedRef.current = true;
        const firstThread = vm.threads.find((t) => t.messageCount > 0);
        if (!firstThread) return;
        selectedThreadIdRef.current = firstThread.id;
        setSelectedThreadId(firstThread.id);
        syncThreadContext(firstThread.id, vm);
        const channel = resolveLoadComposerChannel(firstThread.id, vm, liveChannel);
        void load(firstThread.id, false, { channel });
    }, [initialThreadId, isActivityEmbed, liveChannel, load, selectedThreadId, syncThreadContext, vm]);

    const startNewMessage = useCallback(() => {
        hasUserThreadSelectionRef.current = true;
        setSelectedThreadId(null);
        selectedThreadIdRef.current = null;
        setSubjectDraft("");
        setBodyDraft("");
        setSendResult(null);
        setSendError(null);
        if (vm) syncThreadContext(null, vm);
        void load(null, false);
    }, [load, syncThreadContext, vm]);

    const showAllMessages = useCallback(() => {
        setSelectedThreadId(null);
        selectedThreadIdRef.current = null;
        void load(null, false);
    }, [load]);

    const refreshCurrent = useCallback(async () => {
        await load(selectedThreadIdRef.current, false, { force: true });
    }, [load]);

    const send = useCallback(
        async (confirm: boolean) => {
            const cust = vm?.scope.customerId;
            if (!cust || selectedRecipientIds.length === 0 || !bodyDraft.trim()) return;
            setSending(true);
            setSendError(null);
            const opportunityId =
                input.entity?.entityType === "opportunities" ? input.entity.entityId.trim() : "";
            const fromCurrentWork = input.entryContext === "current_work";
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
                        ...(opportunityId ? { opportunity_id: opportunityId } : {}),
                    }),
                });
                const data = (await res.json()) as FamilySendResult & {
                    error?: string;
                    contact_attempt_association?: {
                        associated?: boolean;
                        task_id?: string;
                    };
                };
                if (!res.ok) { setSendError(data.error ?? "Send failed"); return; }
                setSendResult(data);
                if (confirm) {
                    const scope = resolveFamilyRuntimeInvalidateScope(input);
                    if (scope) invalidateDrawerFamilyWorkspaceCache(scope);
                    const sentRows = data.results.filter((r) => r.status === "sent");
                    const rosterName =
                        vm?.recipientGroups
                            .flatMap((g) => g.recipients)
                            .find((r) => selectedRecipientIds.includes(r.id))?.displayName
                        ?? null;
                    const recipientLabel =
                        sentRows[0]?.display_name
                        ?? rosterName
                        ?? null;
                    const successMessage = buildContactFamilySendSuccessMessage({
                        channel: liveChannel,
                        recipientLabel,
                    });

                    if (fromCurrentWork) {
                        // Contact Family entry: stay on Focus Panel — do not open the thread.
                        setBodyDraft("");
                        if (!selectedThreadId) setSubjectDraft("");
                        setSendResult(null);
                        setSendError(null);
                        setSendCompleteToken((n) => n + 1);
                        if (opportunityId) {
                            dispatchOperationalWorkRefresh({
                                opportunity_id: opportunityId,
                                task_id: data.contact_attempt_association?.task_id ?? null,
                                kind: "complete",
                            });
                            dispatchOpportunityDrawerScopedUpdate(opportunityId, "communications_send", [
                                "activity",
                                "operational_tasks",
                            ]);
                            dispatchContactFamilySendComplete({
                                opportunity_id: opportunityId,
                                channel: liveChannel,
                                recipient_label: recipientLabel,
                                success_message: successMessage,
                                task_id: data.contact_attempt_association?.task_id ?? null,
                                associated: data.contact_attempt_association?.associated === true,
                            });
                        }
                        return;
                    }

                    const priorThreadId = selectedThreadId;
                    const createdThreadId =
                        data.results.find((r) => r.status === "sent" && r.thread_id)?.thread_id ?? null;
                    const threadToOpen = priorThreadId ?? createdThreadId;
                    if (threadToOpen) {
                        setSelectedThreadId(threadToOpen);
                        selectedThreadIdRef.current = threadToOpen;
                        const channel = resolveLoadComposerChannel(threadToOpen, vm, liveChannel);
                        await load(threadToOpen, false, { force: true, channel });
                    } else {
                        await load(null, false, { force: true });
                    }
                    setBodyDraft("");
                    if (!priorThreadId) setSubjectDraft("");
                    setSendResult(null);
                    setSendError(null);
                    setSendCompleteToken((n) => n + 1);
                    if (opportunityId) {
                        dispatchOperationalWorkRefresh({
                            opportunity_id: opportunityId,
                            task_id: data.contact_attempt_association?.task_id ?? null,
                            kind: sentRows.length > 0 ? "complete" : "communications_reply",
                        });
                        dispatchOpportunityDrawerScopedUpdate(opportunityId, "communications_send", [
                            "activity",
                            "operational_tasks",
                        ]);
                    }
                }
            } catch {
                setSendError("Send failed");
            } finally {
                setSending(false);
            }
        },
        [
            vm,
            selectedRecipientIds,
            subjectDraft,
            bodyDraft,
            selectedThreadId,
            liveChannel,
            load,
            input.customerId,
            input.entity?.entityType,
            input.entity?.entityId,
            input.entryContext,
        ]
    );

    const workspaceModeAvailability = useMemo(
        () => resolveWorkspaceModeAvailability(vm, vm?.relatedTasks.length ?? 0),
        [vm],
    );

    const events: TimelineEventVM[] = vm
        ? isThreadScopedSurface
            ? selectedThreadId
                ? vm.messages
                : []
            : selectedThreadId
              ? vm.messages
              : vm.timelineEvents
        : [];
    const messages = useMemo(() => events.map(toFamilyRuntimeTimelineMessage), [events]);
    const timelineMessages = useMemo(() => vm?.timelineEvents.map(toFamilyRuntimeTimelineMessage) ?? [], [vm]);
    const health = useMemo(
        () => computeCommunicationHealth({ messages: events.filter((e) => !e.kind || e.kind === "message").map((e) => ({ direction: e.direction, created_at: e.createdAt, channel: e.channel, opened_at: e.openedAt, replied_at: e.repliedAt })) }),
        [events]
    );
    const healthLabel = health.engagementScore >= 66 ? "Healthy" : health.engagementScore >= 33 ? "At risk" : "Unresponsive";
    const healthTone = health.engagementScore >= 66 ? "text-alloy-juniper" : health.engagementScore >= 33 ? "text-alloy-amber" : "text-red-600";
    const healthDot = health.engagementScore >= 66 ? "bg-alloy-juniper" : health.engagementScore >= 33 ? "bg-alloy-amber" : "bg-red-500";

    const allRecipients = vm?.recipientGroups.flatMap((g) => g.recipients) ?? [];
    const childNames = vm?.children.map((c) => (c.ageLabel ? `${c.name} (${c.ageLabel})` : c.name)) ?? [];
    const detail = vm
        ? {
              owner: vm.family.ownerLabel ?? "Unassigned",
              contactName: allRecipients.find((r) => r.isPrimary)?.displayName ?? allRecipients[0]?.displayName ?? vm.family.label,
              program: vm.family.program,
              stage: vm.family.stage,
              consent: vm.consentSummary.household,
              preferenceProfile: vm.consentSummary.preferenceProfile,
          }
        : undefined;
    const selected = vm ? { id: vm.scope.customerId, family_label: vm.family.label, sla_state: null, assignment_state: "unassigned" } : null;
    const selectedThread = vm?.threads.find((t) => t.id === selectedThreadId) ?? null;

    return {
        vm,
        loading,
        error,
        servedFromWarmCache,
        workspaceMode,
        setWorkspaceMode,
        liveChannel,
        selectedThreadId,
        selectedThread,
        selectedRecipientIds,
        subjectDraft,
        setSubjectDraft,
        bodyDraft,
        setBodyDraft,
        sendResult,
        sendError,
        sending,
        sendCompleteToken,
        workspaceModeAvailability,
        messages,
        timelineMessages,
        childNames,
        detail,
        selected,
        healthTone,
        healthDot,
        healthLabel,
        openThread,
        startNewMessage,
        showAllMessages,
        refreshCurrent,
        send,
        dismissSendResult: () => { setSendResult(null); setSendError(null); },
        toggleRecipient: (id: string) => setSelectedRecipientIds((prev) => toggleRecipientSelection(prev, id, true)),
    };
}
