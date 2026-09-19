"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeCommunicationHealth } from "@/lib/communications/v2/communicationHealth";
import { emptyPreferenceProfile } from "@/lib/communications/v2/communicationPreferenceLabels";
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
import type {
    FamilyComposeDraftSeed,
    FamilyComposeIntent,
} from "@/lib/communications/v2/familyWorkspace/familyComposeIntent";
import {
    appendUrlToComposerDraft,
} from "@/lib/communications/v2/familyWorkspace/composerBodyMarkup";
import { provisionTourInvitationPrepare } from "@/lib/tours/tourInvitationPrepareWarmCache";
import { resolveFamilyComposeIntent } from "@/lib/communications/v2/familyWorkspace/familyComposeIntent";
import { invalidateTourInvitationPrepare } from "@/lib/tours/tourInvitationPrepareWarmCache";
import {
    classifyFamilySendOutcome,
    familySendDelivered,
    familySendFailureMessage,
    familySendPartialMessage,
} from "@/lib/communications/v2/familyWorkspace/familySendOutcome";

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

// Built from the one place the categories are declared, not restated. This literal listed
// four of them and silently went stale the moment the operational pair was added — a second
// copy of a closed vocabulary is a copy that will disagree.
const UNSET_PREFERENCE_PROFILE: PersonPreferenceProfile = emptyPreferenceProfile();

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
            // The PREVIEW view model carries no per-person profiles — the heavy
            // preferences bundle loads with the full workspace. Empty is the
            // honest value: the affordance then reports "no preferences recorded"
            // for a person rather than showing the household's answer under their
            // name, which is exactly the substitution it exists to prevent.
            preferenceProfilesByContact: {},
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
    /**
     * Command entry semantics. `new_message` skips Activity auto-select of an
     * existing thread (Send Message / Contact Family / Tour Invitation).
     * Activity browsing uses default `browse`.
     */
    composeIntent?: FamilyComposeIntent | null;
    /** Prefill for New Message (Tour Invitation subject/body/link, etc.). */
    draftSeed?: FamilyComposeDraftSeed | null;
};

export function useFamilyCommunicationRuntime(input: FamilyCommunicationRuntimeInput) {
    const surfaceVariant = input.surfaceVariant ?? "default";
    const isActivityEmbed = surfaceVariant === "activity_embed";
    const isThreadScopedSurface = surfaceVariant === "activity_embed" || surfaceVariant === "workspace_inbox";
    const composeIntent = resolveFamilyComposeIntent(input.composeIntent);
    const forceNewMessage = composeIntent === "new_message";
    const draftSeed = input.draftSeed ?? null;
    const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(() =>
        draftSeed?.channel === "sms" || input.channel === "sms" ? "sms" : "email",
    );
    const liveChannel: ComposerChannel = workspaceMode === "sms" ? "sms" : "email";
    // Command-driven New Message never inherits a historical thread id.
    const initialThreadId = forceNewMessage ? null : (input.initialThreadId ?? null);
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
    const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>(() => {
        const seeded = draftSeed?.recipientPersonIds?.map((id) => id.trim()).filter(Boolean) ?? [];
        return seeded.length ? seeded : (vm?.selectedRecipients ?? []);
    });
    const [subjectDraft, setSubjectDraft] = useState(() => String(draftSeed?.subject ?? "").trim());
    const [bodyDraft, setBodyDraft] = useState(() => {
        if (draftSeed?.channel === "sms") {
            return String(draftSeed.smsBody ?? draftSeed.body ?? "").trim();
        }
        return String(draftSeed?.body ?? "").trim();
    });
    const [sendResult, setSendResult] = useState<FamilySendResult | null>(null);
    const [sendError, setSendError] = useState<string | null>(null);
    const [sending, setSending] = useState(false);
    const [sendCompleteToken, setSendCompleteToken] = useState(0);
    const mountedRef = useRef(false);
    const activityEmbedBootstrappedRef = useRef(false);
    const draftSeedAppliedRef = useRef(false);
    const hasUserThreadSelectionRef = useRef(forceNewMessage);
    // Insert may set this without a draftSeed; never wipe Insert-provisioned ids on re-render.
    const tourInvitationIdRef = useRef<string | null>(draftSeed?.tourInvitationId?.trim() || null);
    /*
     * The same acknowledgement contract as a tour invitation, for enrollment paperwork: the send
     * itself is already recorded by Communications, and this records that the send WAS the operator
     * pressing Send enrollment paperwork, for this child, on this episode.
     */
    const paperworkSessionIdRef = useRef<string | null>(
        draftSeed?.enrollmentPaperworkSessionId?.trim() || null,
    );
    const paperworkChildIdRef = useRef<string | null>(draftSeed?.enrollmentPaperworkChildId?.trim() || null);
    /** Deferred Current Work completion — fired on Done after success ack, not on confirm. */
    const pendingContactFamilyCompleteRef = useRef<{
        opportunity_id: string;
        channel: "email" | "sms";
        recipient_label: string | null;
        success_message: string;
        task_id: string | null;
        associated: boolean;
        outcome_key: string | null;
        tour_invitation: boolean;
    } | null>(null);
    const confirmInFlightRef = useRef(false);

    /**
     * WHICH SEND ATTEMPT THIS IS — not which message it happens to contain.
     *
     * The server protects a send with an idempotency key, and with no token from the client that key
     * was derived from the CONTENT: `family_send:<hash of subject+body>:<personId>`. For an authored
     * one-off that is almost harmless. For a message the product GENERATES the same way every time —
     * enrollment paperwork is regenerated verbatim for a child — the key is the same forever, so:
     *
     *   • an intentional resend of identical paperwork was swallowed as an idempotent replay, and
     *   • once anything in the server's fingerprint changed (it includes the recipient ADDRESS), the
     *     key permanently conflicted and the operator was told, on the ordinary Send path, to
     *     "use a new key" for a key they never chose and cannot reach.
     *
     * Reproduced on the certified path: preflight ready, confirm failed, `Could not send · This send
     * key was already used with different content or recipient.` The guardian's address had changed
     * between QA sends months of product-time earlier.
     *
     * So the composer names the ATTEMPT. One token covers one confirmation episode — every Confirm
     * retry inside it, including after a network timeout, so a double-send is still impossible — and
     * a new one is minted the moment the operator returns to editing, starts a new message, switches
     * thread, or acknowledges a completed send. Those are exactly the moments a human means "this is
     * a different communication".
     */
    const attemptTokenRef = useRef<string | null>(null);
    const beginSendAttempt = useCallback(() => {
        if (attemptTokenRef.current) return attemptTokenRef.current;
        const token =
            typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                ? crypto.randomUUID()
                : `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
        attemptTokenRef.current = token;
        return token;
    }, []);
    /** The operator went back to composing: whatever they confirm next is a different attempt. */
    const endSendAttempt = useCallback(() => {
        attemptTokenRef.current = null;
    }, []);
    const [tourInvitationAck, setTourInvitationAck] = useState(Boolean(draftSeed?.tourInvitationId));
    const loadRequestSeqRef = useRef(0);
    const selectedThreadIdRef = useRef<string | null>(selectedThreadId);
    selectedThreadIdRef.current = selectedThreadId;
    const familyScopeKey = useMemo(
        () =>
            `${input.customerId ?? ""}|${input.entity?.entityType ?? ""}|${input.entity?.entityId ?? ""}|${initialThreadId ?? ""}|${composeIntent}|${draftSeed?.tourInvitationId ?? ""}`,
        [
            input.customerId,
            input.entity?.entityType,
            input.entity?.entityId,
            initialThreadId,
            composeIntent,
            draftSeed?.tourInvitationId,
        ],
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
        hasUserThreadSelectionRef.current = forceNewMessage || Boolean(initialThreadId);
        setSelectedThreadId(initialThreadId);
        selectedThreadIdRef.current = initialThreadId;
        draftSeedAppliedRef.current = false;
        const seed = draftSeed;
        tourInvitationIdRef.current = seed?.tourInvitationId?.trim() || null;
        paperworkSessionIdRef.current = seed?.enrollmentPaperworkSessionId?.trim() || null;
        paperworkChildIdRef.current = seed?.enrollmentPaperworkChildId?.trim() || null;
        setTourInvitationAck(Boolean(seed?.tourInvitationId?.trim()));
        pendingContactFamilyCompleteRef.current = null;
        if (seed) {
            setSubjectDraft(String(seed.subject ?? "").trim());
            setBodyDraft(
                seed.channel === "sms"
                    ? String(seed.smsBody ?? seed.body ?? "").trim()
                    : String(seed.body ?? "").trim(),
            );
            const recipients = (seed.recipientPersonIds ?? []).map((id) => id.trim()).filter(Boolean);
            if (recipients.length) setSelectedRecipientIds(recipients);
            if (seed.channel === "sms" || seed.channel === "email") setWorkspaceMode(seed.channel);
            draftSeedAppliedRef.current = true;
        } else {
            setSubjectDraft("");
            setBodyDraft("");
        }
        setSendResult(null);
        setSendError(null);
        activityEmbedBootstrappedRef.current = forceNewMessage;
        const params = resolveFamilyRuntimePrefetchParams(input, liveChannel, initialThreadId);
        const warm = params ? getDrawerFamilyWorkspaceWarm(params) : null;
        setServedFromWarmCache(Boolean(warm || input.initialPreviewVm));
        void loadRef.current(initialThreadId, true);
        // Scope reset only — must not re-run when liveChannel/load identity changes (thread switch).
    }, [familyScopeKey, input.initialPreviewVm, forceNewMessage]);

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
        endSendAttempt();
        hasUserThreadSelectionRef.current = true;
        setSelectedThreadId(threadId);
        selectedThreadIdRef.current = threadId;
        setBodyDraft("");
        setSendResult(null);
        setSendError(null);
        const channel = resolveLoadComposerChannel(threadId, vm, liveChannel);
        if (vm) syncThreadContext(threadId, vm);
        void load(threadId, false, { channel });
    }, [endSendAttempt, load, liveChannel, syncThreadContext, vm]);

    useEffect(() => {
        if (!isThreadScopedSurface || !vm || !selectedThreadId) return;
        syncThreadContext(selectedThreadId, vm);
    }, [isThreadScopedSurface, selectedThreadId, syncThreadContext, vm]);

    useEffect(() => {
        // Activity browse may auto-open the first thread with messages.
        // Explicit New Message commands must not inherit history/Reply.
        if (forceNewMessage) return;
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
    }, [forceNewMessage, initialThreadId, isActivityEmbed, liveChannel, load, selectedThreadId, syncThreadContext, vm]);

    const startNewMessage = useCallback(() => {
        endSendAttempt();
        hasUserThreadSelectionRef.current = true;
        setSelectedThreadId(null);
        selectedThreadIdRef.current = null;
        setSubjectDraft("");
        setBodyDraft("");
        setSendResult(null);
        setSendError(null);
        if (vm) syncThreadContext(null, vm);
        void load(null, false);
    }, [endSendAttempt, load, syncThreadContext, vm]);

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
            const attemptToken = beginSendAttempt();
            if (confirm) {
                if (confirmInFlightRef.current) return;
                confirmInFlightRef.current = true;
            }
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
                        // Names this confirmation episode. See `attemptTokenRef`.
                        client_token: attemptToken,
                        ...(opportunityId ? { opportunity_id: opportunityId } : {}),
                    }),
                });
                const data = (await res.json()) as FamilySendResult & {
                    error?: string;
                    contact_attempt_association?: {
                        associated?: boolean;
                        task_id?: string;
                        outcome_key?: string;
                    };
                };
                if (!res.ok) { setSendError(data.error ?? "Send failed"); return; }
                setSendResult(data);
                if (confirm) {
                    const scope = resolveFamilyRuntimeInvalidateScope(input);
                    if (scope) invalidateDrawerFamilyWorkspaceCache(scope);

                    /*
                     * ── HTTP SUCCESS IS NOT DELIVERY ──
                     *
                     * The only failure branch here was `!res.ok`, so a 200 carrying
                     * `sent: 0, failed: 1` walked into the success path: the operator was told
                     * "Email sent to Tourb Tourb0913" for a message that never left, and the
                     * post-send `mark_sent` below recorded an audit event for a delivery that did
                     * not happen. Measured live, with the public-origin guard correctly refusing a
                     * participant link pointing at localhost.
                     *
                     * The verdict comes from the summary the canonical send owner returns, read
                     * through the one classifier that owns it — never from the status code.
                     */
                    const outcome = classifyFamilySendOutcome(data.summary);
                    if (outcome === "total_failure" || outcome === "nothing_requested") {
                        /*
                         * The draft SURVIVES. The operator has a reachability or consent problem to
                         * correct and then a message to retry; throwing away what they wrote would
                         * make a delivery failure cost them their words as well.
                         */
                        setSendError(familySendFailureMessage(data.results));
                        return;
                    }

                    const sentRows = data.results.filter((r) => r.status === "sent");
                    const rosterName =
                        vm?.recipientGroups
                            .flatMap((g) => g.recipients)
                            .find((r) => selectedRecipientIds.includes(r.id))?.displayName
                        ?? null;
                    /*
                     * Named from a row that ACTUALLY SENT. The roster fallback is why the false
                     * success could name a recipient at all — with nothing delivered, `sentRows` was
                     * empty and the label came from whoever was selected. It stays as a fallback for
                     * a delivered row whose display name is missing, and cannot be reached when
                     * nothing was delivered because that case has already returned.
                     */
                    const recipientLabel = sentRows[0]?.display_name ?? rosterName ?? null;
                    const successMessage =
                        outcome === "partial_delivery"
                            ? familySendPartialMessage({ channel: liveChannel, summary: data.summary })
                            : buildContactFamilySendSuccessMessage({
                                  channel: liveChannel,
                                  recipientLabel,
                              });
                    const tourInvitationId = tourInvitationIdRef.current;
                    const wasTourInvitation = Boolean(tourInvitationId);
                    if (wasTourInvitation) setTourInvitationAck(true);

                    if (fromCurrentWork) {
                        /*
                         * ── AN AUDIT OF DELIVERY MUST FOLLOW DELIVERY ──
                         *
                         * `mark_sent` records that a family WAS contacted. It ran as soon as the send
                         * request completed, so a refused delivery still produced an audit event
                         * saying the message went out — the operator-intent trail and the delivery
                         * trail disagreed, and the trail was the one that was wrong.
                         *
                         * The rule is the canonical send route's own: `sent > 0`. Partial delivery
                         * qualifies, because contact genuinely occurred for at least one recipient,
                         * which is exactly what the route already applies to its contact-attempt
                         * association. Total failure returned above and never reaches here; the
                         * guard is stated anyway, because an invariant that depends on an early
                         * return several lines away is one refactor from being lost.
                         */
                        const delivered = familySendDelivered(data.summary);
                        if (tourInvitationId && opportunityId && delivered) {
                            try {
                                await fetch("/api/admin/actions/execute", {
                                    method: "POST",
                                    credentials: "include",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        action_key: "send_tour_invitation",
                                        entity_type: "opportunity",
                                        entity_id: opportunityId,
                                        context: { surface: "focus_panel", origin: "operator" },
                                        payload: {
                                            mode: "mark_sent",
                                            invitation_id: tourInvitationId,
                                            channel: liveChannel,
                                            recipient_display_name: recipientLabel,
                                        },
                                        confirmation: { confirmed: true },
                                    }),
                                });
                            } catch {
                                // Send already succeeded — invitation mark is best-effort; Activity still records outbound.
                            }
                            invalidateTourInvitationPrepare(opportunityId);
                            tourInvitationIdRef.current = null;
                        }

                        const paperworkSessionId = paperworkSessionIdRef.current;
                        const paperworkChildId = paperworkChildIdRef.current;
                        // Same rule, same reason: the paperwork audit records a delivery, so it may
                        // only be written when one occurred.
                        if (paperworkSessionId && paperworkChildId && delivered) {
                            try {
                                await fetch("/api/admin/actions/execute", {
                                    method: "POST",
                                    credentials: "include",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        action_key: "enrollment.send_paperwork",
                                        entity_type: "child",
                                        entity_id: paperworkChildId,
                                        context: { surface: "focus_panel", origin: "operator" },
                                        payload: {
                                            mode: "mark_sent",
                                            session_id: paperworkSessionId,
                                            channel: liveChannel,
                                            recipient_display_name: recipientLabel,
                                        },
                                        confirmation: { confirmed: true },
                                    }),
                                });
                            } catch {
                                // The send already succeeded. The outbound message, its thread and
                                // its delivery state are the delivery record; this mark is the
                                // operator-intent audit on top of it, and best-effort by design.
                            }
                            paperworkSessionIdRef.current = null;
                        }
                        setBodyDraft("");
                        if (!selectedThreadId) setSubjectDraft("");
                        if (opportunityId) {
                            pendingContactFamilyCompleteRef.current = {
                                opportunity_id: opportunityId,
                                channel: liveChannel,
                                recipient_label: recipientLabel,
                                success_message: successMessage,
                                task_id: data.contact_attempt_association?.task_id ?? null,
                                associated: data.contact_attempt_association?.associated === true,
                                outcome_key: data.contact_attempt_association?.outcome_key ?? null,
                                tour_invitation: wasTourInvitation,
                            };
                            dispatchOperationalWorkRefresh({
                                opportunity_id: opportunityId,
                                task_id: data.contact_attempt_association?.task_id ?? null,
                                kind: "complete",
                            });
                            dispatchOpportunityDrawerScopedUpdate(opportunityId, "communications_send", [
                                "activity",
                                "operational_tasks",
                            ]);
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
                    // Keep sendResult (mode: sent) for centered success acknowledgement.
                    // sendCompleteToken bumps on Done so reply collapse happens after ack.
                }
            } catch {
                setSendError("Send failed");
            } finally {
                setSending(false);
                if (confirm) confirmInFlightRef.current = false;
            }
        },
        [
            beginSendAttempt,
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

    const dismissSendResult = useCallback(() => {
        setSendResult(null);
        setSendError(null);
        // Back to edit. The next confirmation is a new attempt, not a retry of this one.
        endSendAttempt();
    }, [endSendAttempt]);

    /**
     * Done on success (or dismiss error) — collapses reply / closes Current Work command surface.
     * Refreshes already fired on confirm; this only completes the acknowledgement lifecycle.
     */
    const acknowledgeSendSuccess = useCallback(() => {
        setSendResult(null);
        setSendError(null);
        endSendAttempt();
        setSendCompleteToken((n) => n + 1);
        const pending = pendingContactFamilyCompleteRef.current;
        pendingContactFamilyCompleteRef.current = null;
        if (pending) {
            dispatchContactFamilySendComplete({
                opportunity_id: pending.opportunity_id,
                channel: pending.channel,
                recipient_label: pending.recipient_label,
                success_message: pending.success_message,
                task_id: pending.task_id,
                associated: pending.associated,
                outcome_key: pending.outcome_key,
            });
        }
        setTourInvitationAck(false);
    }, [endSendAttempt]);

    /**
     * Insert ▾ → Tour Invitation Link — same prepare authority as Send Tour Invitation.
     * Provisions a fresh URL into the visible draft; does not send.
     */
    const insertTourInvitationLink = useCallback(async (): Promise<{ ok: true } | { ok: false; message: string }> => {
        const opportunityId =
            input.entity?.entityType === "opportunities" ? input.entity.entityId.trim() : "";
        if (!opportunityId) {
            return { ok: false, message: "Tour invitation links require an opportunity context." };
        }
        const prepared = await provisionTourInvitationPrepare(opportunityId, { forceFresh: true });
        const url = String(prepared?.invitationActionUrl ?? "").trim();
        if (!prepared?.invitationId || !url) {
            return { ok: false, message: "Could not provision a Tour Invitation Link. Try again." };
        }
        tourInvitationIdRef.current = prepared.invitationId;
        setTourInvitationAck(true);
        setBodyDraft((prev) => appendUrlToComposerDraft(prev, url));
        return { ok: true };
    }, [input.entity?.entityType, input.entity?.entityId]);

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
        /** What this message is about, when that is not its recipient. Presentation only. */
        composeSubjectLabel: draftSeed?.subjectLabel?.trim() || null,
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
        dismissSendResult,
        acknowledgeSendSuccess,
        tourInvitationAck,
        insertTourInvitationLink,
        toggleRecipient: (id: string) => setSelectedRecipientIds((prev) => toggleRecipientSelection(prev, id, true)),
    };
}
