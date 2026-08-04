import type { SupabaseClient } from "@supabase/supabase-js";

import { enqueueCanonicalOutboundMessage } from "@/lib/communications/canonicalOutboundEnqueue";
import { triggerBackendMessagesQueue } from "@/lib/communications/triggerBackendMessagesQueue";
import type { TourBookingRow } from "@/lib/tours/bookings/types";
import {
    TOUR_COMMS_CHANNELS,
    TOUR_COMMS_OUTBOUND_METADATA,
    TOUR_COMMS_OUTBOUND_SOURCE,
    type TourCommsChannel,
    type TourCommsConfig,
    type TourCommsEventKey,
} from "@/lib/tours/comms/tourCommsConfig";
import { loadTourCommsContext } from "@/lib/tours/comms/loadTourCommsContext";
import { resolveTourCommsConfig } from "@/lib/tours/comms/resolveTourCommsConfig";
import {
    resolveTourCommsParentRecipient,
    tourCommsRecipientHasChannel,
    type TourCommsParentRecipient,
} from "@/lib/tours/comms/resolveTourCommsRecipient";
import {
    buildTourAddToCalendarLinksFromContext,
    withTourAddToCalendarLinks,
} from "@/lib/tours/comms/tourAddToCalendarLinks";
import { omitEmptyOptionalTourCommsLines, renderTourCommsTemplate } from "@/lib/tours/comms/tourCommsTemplates";
import type { TourCommsTemplateContext } from "@/lib/tours/comms/tourCommsTemplateContext";
import {
    cancelPendingTourSchedulingRemindersForBooking,
    replaceTourSchedulingRemindersForBooking,
    scheduleTourSchedulingRemindersForBooking,
    type ScheduleTourSchedulingRemindersResult,
    type TourSchedulingReminderSnapshot,
} from "@/lib/tours/comms/tourSchedulingScheduledSends";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export type TourCommsImmediateSendResult = {
    channel: TourCommsChannel;
    eventKey: TourCommsEventKey;
    status: "sent" | "skipped" | "failed" | "deduped";
    reason?: string;
    communicationMessageId?: string | null;
    idempotencyKey?: string;
};

export type TourCommsReminderActionResult =
    | { action: "none" }
    | ({ action: "schedule" | "replace" | "cancel" } & (
          | { ok: true; scheduledCount?: number; canceledCount?: number; suppressedCount?: number }
          | { ok: false; error: string; message: string }
      ));

export type TourCommsOrchestrationResult = {
    ok: true;
    disabled: boolean;
    skippedReasons: string[];
    immediate: TourCommsImmediateSendResult[];
    reminders: TourCommsReminderActionResult;
};

export type TourCommsOrchestratorDeps = {
    enqueueImmediate?: typeof enqueueCanonicalOutboundMessage;
    triggerQueue?: typeof triggerBackendMessagesQueue;
    scheduleReminders?: typeof scheduleTourSchedulingRemindersForBooking;
    replaceReminders?: typeof replaceTourSchedulingRemindersForBooking;
    cancelReminders?: typeof cancelPendingTourSchedulingRemindersForBooking;
    loadContext?: typeof loadTourCommsContext;
    resolveConfig?: typeof resolveTourCommsConfig;
    hasExistingImmediateSend?: typeof hasExistingTourCommsImmediateSend;
};

export type TourCommsOrchestrateInput = {
    supabase: SupabaseClient;
    orgId: string;
    booking: TourBookingRow;
    actorUserId?: string | null;
    /** Immediate notification event; omit when none. */
    immediateEventKey?: TourCommsEventKey | null;
    /** Token for idempotency on immediate sends (e.g. `confirmed`, `canceled`). */
    immediateGenerationToken?: string;
    /** Telemetry: confirm | reschedule | cancel | no_show | complete */
    lifecycleAction?: string | null;
    reminderAction?: "schedule" | "replace" | "cancel" | "none";
    scheduleGeneration?: number;
    /**
     * Parent-safe action URLs for THIS booking's current state, minted by the caller
     * after the booking committed. Only URLs cross this boundary — never an action
     * kind, id, or status.
     */
    actionModel?: { rescheduleUrl?: string | null; cancelUrl?: string | null; confirmUrl?: string | null } | null;
    deps?: TourCommsOrchestratorDeps;
};

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

export function resolveTourCommsActorUserId(
    booking: Pick<TourBookingRow, "requested_by_user_id">,
    actorUserId?: string | null
): string {
    const candidates = [actorUserId, booking.requested_by_user_id];
    for (const c of candidates) {
        const s = String(c ?? "").trim();
        if (UUID_RE.test(s)) return s;
    }
    return "00000000-0000-0000-0000-000000000000";
}

export function resolveTourCommsScheduleGeneration(
    booking: Pick<TourBookingRow, "updated_at" | "metadata">
): number {
    if (isRecord(booking.metadata) && typeof booking.metadata.tour_comms_schedule_generation === "number") {
        const n = Math.floor(booking.metadata.tour_comms_schedule_generation);
        if (n > 0) return n;
    }
    const t = Date.parse(booking.updated_at);
    return Number.isNaN(t) ? 1 : Math.max(1, Math.floor(t / 1000));
}

/**
 * What a tour message is *about*. A booking and an invitation are both subjects —
 * an invitation precedes any booking, which is why the send path cannot be keyed on
 * a `TourBookingRow`. Generalizing here is what keeps one sender instead of two.
 */
export type TourCommsSubject = {
    kind: "booking" | "invitation";
    id: string;
    opportunityId: string;
    locationId: string | null;
};

export function tourCommsSubjectFromBooking(
    booking: Pick<TourBookingRow, "id" | "opportunity_id" | "location_id">
): TourCommsSubject {
    return {
        kind: "booking",
        id: booking.id,
        opportunityId: booking.opportunity_id,
        locationId: booking.location_id ?? null,
    };
}

export function buildTourCommsImmediateIdempotencyKey(input: {
    subjectId: string;
    eventKey: TourCommsEventKey;
    channel: TourCommsChannel;
    generationToken: string;
}): string {
    const token = String(input.generationToken ?? "").trim() || "v1";
    return `tour_scheduling:immediate:${input.subjectId}:${input.eventKey}:${input.channel}:${token}`;
}

/** Standard outbound metadata for immediate tour comms (Batch 6 telemetry). */
export function buildTourCommsImmediateOutboundMetadata(input: {
    subject: TourCommsSubject;
    eventKey: TourCommsEventKey;
    channel: TourCommsChannel;
    idempotencyKey: string;
    scheduleGeneration: number;
    recipientPersonId: string;
    lifecycleAction?: string | null;
}): Record<string, unknown> {
    const subjectKey =
        input.subject.kind === "invitation"
            ? TOUR_COMMS_OUTBOUND_METADATA.tourInvitationId
            : TOUR_COMMS_OUTBOUND_METADATA.tourBookingId;
    const metadata: Record<string, unknown> = {
        [TOUR_COMMS_OUTBOUND_METADATA.source]: TOUR_COMMS_OUTBOUND_SOURCE,
        [subjectKey]: input.subject.id,
        [TOUR_COMMS_OUTBOUND_METADATA.opportunityId]: input.subject.opportunityId,
        [TOUR_COMMS_OUTBOUND_METADATA.eventKey]: input.eventKey,
        [TOUR_COMMS_OUTBOUND_METADATA.channel]: input.channel,
        [TOUR_COMMS_OUTBOUND_METADATA.idempotencyKey]: input.idempotencyKey,
        [TOUR_COMMS_OUTBOUND_METADATA.sendGeneration]: input.scheduleGeneration,
        [TOUR_COMMS_OUTBOUND_METADATA.recipientPersonId]: input.recipientPersonId,
    };
    const action = String(input.lifecycleAction ?? "").trim();
    if (action) {
        metadata[TOUR_COMMS_OUTBOUND_METADATA.lifecycleAction] = action;
    }
    return metadata;
}

export async function hasExistingTourCommsImmediateSend(params: {
    supabase: SupabaseClient;
    orgId: string;
    idempotencyKey: string;
}): Promise<boolean> {
    const key = String(params.idempotencyKey ?? "").trim();
    if (!key) return false;
    const { data, error } = await params.supabase
        .from("communication_messages")
        .select("id")
        .eq("org_id", params.orgId)
        .eq("direction", "outbound")
        .contains("metadata", { [TOUR_COMMS_OUTBOUND_METADATA.idempotencyKey]: key })
        .limit(1);
    if (error) {
        console.warn("[tour_comms] idempotency lookup failed", error.message);
        return false;
    }
    return (data ?? []).length > 0;
}

function enrichTemplateContextWithCalendarLinks(
    context: TourCommsTemplateContext,
    booking: TourBookingRow
): TourCommsTemplateContext {
    try {
        const links = buildTourAddToCalendarLinksFromContext(context, {
            bookingId: booking.id,
            summary: `Tour at ${context.locationName ?? context.orgName ?? "Alloy"}`,
        });
        const withLinks = withTourAddToCalendarLinks(context, links);
        return {
            ...withLinks,
            addToCalendarUrl: withLinks.googleCalendarUrl || withLinks.outlookCalendarUrl || "",
        };
    } catch {
        return context;
    }
}

function renderImmediateBody(
    eventKey: TourCommsEventKey,
    channel: TourCommsChannel,
    context: TourCommsTemplateContext,
    config: TourCommsConfig
): { subject: string | null; body: string } {
    const rendered = renderTourCommsTemplate({
        eventKey,
        channel,
        context,
        templateOverrides: config.templates,
    });
    if (!rendered) return { subject: null, body: "" };
    if (rendered.channel === "email") {
        const body = omitEmptyOptionalTourCommsLines(rendered.bodyText);
        return { subject: rendered.subject, body };
    }
    return { subject: null, body: omitEmptyOptionalTourCommsLines(rendered.body) };
}

function renderReminderSnapshots(
    context: TourCommsTemplateContext,
    config: TourCommsConfig
): Partial<Record<TourCommsChannel, TourSchedulingReminderSnapshot>> {
    const out: Partial<Record<TourCommsChannel, TourSchedulingReminderSnapshot>> = {};
    for (const channel of TOUR_COMMS_CHANNELS) {
        if (!config.channels[channel]) continue;
        const { subject, body } = renderImmediateBody("tour_reminder", channel, context, config);
        out[channel] = { subject, body };
    }
    return out;
}

async function sendImmediateTourComms(params: {
    supabase: SupabaseClient;
    orgId: string;
    subject: TourCommsSubject;
    config: TourCommsConfig;
    context: TourCommsTemplateContext;
    recipientPersonId: string;
    recipientTo: string;
    channel: TourCommsChannel;
    eventKey: TourCommsEventKey;
    generationToken: string;
    scheduleGeneration: number;
    lifecycleAction?: string | null;
    deps: Required<Pick<TourCommsOrchestratorDeps, "enqueueImmediate" | "triggerQueue" | "hasExistingImmediateSend">>;
}): Promise<TourCommsImmediateSendResult> {
    const idempotencyKey = buildTourCommsImmediateIdempotencyKey({
        subjectId: params.subject.id,
        eventKey: params.eventKey,
        channel: params.channel,
        generationToken: params.generationToken,
    });

    const exists = await params.deps.hasExistingImmediateSend({
        supabase: params.supabase,
        orgId: params.orgId,
        idempotencyKey,
    });
    if (exists) {
        return {
            channel: params.channel,
            eventKey: params.eventKey,
            status: "deduped",
            idempotencyKey,
            reason: "idempotency_key_exists",
        };
    }

    const { subject, body } = renderImmediateBody(params.eventKey, params.channel, params.context, params.config);
    if (!body.trim()) {
        return {
            channel: params.channel,
            eventKey: params.eventKey,
            status: "skipped",
            reason: "empty_body",
            idempotencyKey,
        };
    }

    const metadata = buildTourCommsImmediateOutboundMetadata({
        subject: params.subject,
        eventKey: params.eventKey,
        channel: params.channel,
        idempotencyKey,
        scheduleGeneration: params.scheduleGeneration,
        recipientPersonId: params.recipientPersonId,
        lifecycleAction: params.lifecycleAction,
    });

    const enqueued = await params.deps.enqueueImmediate({
        supabase: params.supabase,
        orgId: params.orgId,
        primaryEntityType: "opportunities",
        primaryEntityId: params.subject.opportunityId,
        // THE recipient identity, carried as a typed canonical field — not merely
        // telemetry. It was previously recorded in `metadata` only, so canonical
        // eligibility received `null` and correctly failed closed with
        // RECIPIENT_UNRESOLVED: an external send with no resolved identity cannot be
        // evaluated for opt-out, suppression or channel usability. The identity was
        // already resolved here; it just never crossed the boundary.
        recipientPersonId: params.recipientPersonId,
        channelRaw: params.channel,
        toRaw: params.recipientTo,
        bodyRaw: body,
        emailSubjectRaw: params.channel === "email" ? subject ?? undefined : undefined,
        workflowRunId: null,
        metadata,
        contextLocationId: params.subject.locationId,
    });

    if (!enqueued.communicationMessageId) {
        return {
            channel: params.channel,
            eventKey: params.eventKey,
            status: "failed",
            reason: enqueued.skippedReason ?? "enqueue_failed",
            idempotencyKey,
        };
    }

    void params.deps.triggerQueue({ workflow_run_id: null, limit: 25 }).catch(() => {});

    return {
        channel: params.channel,
        eventKey: params.eventKey,
        status: "sent",
        communicationMessageId: enqueued.communicationMessageId,
        idempotencyKey,
    };
}

async function runReminderAction(params: {
    supabase: SupabaseClient;
    orgId: string;
    booking: TourBookingRow;
    config: TourCommsConfig;
    actorUserId: string;
    recipientPersonId: string;
    orgTimezoneIana: string;
    reminderAction: "schedule" | "replace" | "cancel" | "none";
    scheduleGeneration: number;
    snapshots: Partial<Record<TourCommsChannel, TourSchedulingReminderSnapshot>>;
    deps: Required<
        Pick<TourCommsOrchestratorDeps, "scheduleReminders" | "replaceReminders" | "cancelReminders">
    >;
}): Promise<TourCommsReminderActionResult> {
    if (params.reminderAction === "none") return { action: "none" };

    if (params.reminderAction === "cancel") {
        const canceled = await params.deps.cancelReminders({
            supabase: params.supabase,
            orgId: params.orgId,
            tourBookingId: params.booking.id,
            opportunityId: params.booking.opportunity_id,
        });
        if (!canceled.ok) {
            return { action: "cancel", ok: false, error: canceled.error, message: canceled.message };
        }
        return { action: "cancel", ok: true, canceledCount: canceled.canceledCount };
    }

    const baseInput = {
        supabase: params.supabase,
        orgId: params.orgId,
        opportunityId: params.booking.opportunity_id,
        recipientPersonId: params.recipientPersonId,
        actorUserId: params.actorUserId,
        booking: {
            id: params.booking.id,
            start_at: params.booking.start_at,
            status_key: params.booking.status_key,
            timezone: params.booking.timezone,
            location_id: params.booking.location_id,
        },
        config: params.config,
        scheduleGeneration: params.scheduleGeneration,
        orgTimezoneIana: params.orgTimezoneIana,
        snapshots: params.snapshots,
    };

    if (params.reminderAction === "replace") {
        const replaced = await params.deps.replaceReminders(baseInput);
        if (!replaced.ok) {
            return { action: "replace", ok: false, error: replaced.error, message: replaced.message };
        }
        return {
            action: "replace",
            ok: true,
            scheduledCount: replaced.scheduled.length,
            canceledCount: replaced.canceledCount,
            suppressedCount: replaced.suppressed.length,
        };
    }

    const scheduled: ScheduleTourSchedulingRemindersResult = await params.deps.scheduleReminders(baseInput);
    if (!scheduled.ok) {
        return { action: "schedule", ok: false, error: scheduled.error, message: scheduled.message };
    }
    return {
        action: "schedule",
        ok: true,
        scheduledCount: scheduled.scheduled.length,
        suppressedCount: scheduled.suppressed.length,
    };
}

export async function orchestrateTourCommsForBooking(input: TourCommsOrchestrateInput): Promise<TourCommsOrchestrationResult> {
    const deps: Required<TourCommsOrchestratorDeps> = {
        enqueueImmediate: input.deps?.enqueueImmediate ?? enqueueCanonicalOutboundMessage,
        triggerQueue: input.deps?.triggerQueue ?? triggerBackendMessagesQueue,
        scheduleReminders: input.deps?.scheduleReminders ?? scheduleTourSchedulingRemindersForBooking,
        replaceReminders: input.deps?.replaceReminders ?? replaceTourSchedulingRemindersForBooking,
        cancelReminders: input.deps?.cancelReminders ?? cancelPendingTourSchedulingRemindersForBooking,
        loadContext: input.deps?.loadContext ?? loadTourCommsContext,
        resolveConfig: input.deps?.resolveConfig ?? resolveTourCommsConfig,
        hasExistingImmediateSend: input.deps?.hasExistingImmediateSend ?? hasExistingTourCommsImmediateSend,
    };

    const skippedReasons: string[] = [];
    const immediate: TourCommsImmediateSendResult[] = [];

    const { config } = await deps.resolveConfig(input.supabase, {
        orgId: input.orgId,
        locationId: input.booking.location_id,
    });

    if (!config.enabled) {
        return {
            ok: true,
            disabled: true,
            skippedReasons: ["config_disabled"],
            immediate: [],
            reminders: { action: "none" },
        };
    }

    const loaded = await deps.loadContext({
        supabase: input.supabase,
        orgId: input.orgId,
        bookingId: input.booking.id,
        booking: input.booking,
    });
    if (!loaded) {
        skippedReasons.push("context_load_failed");
        return { ok: true, disabled: false, skippedReasons, immediate, reminders: { action: "none" } };
    }

    const recipient = await resolveTourCommsParentRecipient({
        supabase: input.supabase,
        orgId: input.orgId,
        booking: input.booking,
        opportunity: loaded.opportunity,
    });

    const actorUserId = resolveTourCommsActorUserId(input.booking, input.actorUserId);
    const scheduleGeneration = input.scheduleGeneration ?? resolveTourCommsScheduleGeneration(input.booking);
    const generationToken = String(input.immediateGenerationToken ?? scheduleGeneration).trim() || String(scheduleGeneration);

    const baseContext = enrichTemplateContextWithCalendarLinks(loaded.templateContext, input.booking);
    // Caller-supplied action URLs win: they were minted for the state the booking is
    // actually in now. Without them the templates render their optional action lines
    // empty and the lines are stripped, which is how a confirmation ended up offering
    // the parent nothing to do.
    const templateContext = input.actionModel
        ? {
              ...baseContext,
              rescheduleUrl: input.actionModel.rescheduleUrl ?? baseContext.rescheduleUrl ?? null,
              cancelUrl: input.actionModel.cancelUrl ?? baseContext.cancelUrl ?? null,
              ctaUrl: input.actionModel.confirmUrl ?? baseContext.ctaUrl ?? null,
          }
        : baseContext;
    const reminderSnapshots = renderReminderSnapshots(templateContext, config);

    const reminderAction = input.reminderAction ?? "none";
    let reminders: TourCommsReminderActionResult = { action: "none" };

    if (input.immediateEventKey && recipient) {
        for (const channel of TOUR_COMMS_CHANNELS) {
            if (!config.channels[channel]) continue;
            if (!tourCommsRecipientHasChannel(recipient, channel)) {
                immediate.push({
                    channel,
                    eventKey: input.immediateEventKey,
                    status: "skipped",
                    reason: channel === "email" ? "missing_email" : "missing_sms",
                });
                continue;
            }

            const to = channel === "email" ? recipient.email! : recipient.smsTo!;
            immediate.push(
                await sendImmediateTourComms({
                    supabase: input.supabase,
                    orgId: input.orgId,
                    subject: tourCommsSubjectFromBooking(input.booking),
                    config,
                    context: templateContext,
                    recipientPersonId: recipient.personId,
                    recipientTo: to,
                    channel,
                    eventKey: input.immediateEventKey,
                    generationToken,
                    scheduleGeneration,
                    lifecycleAction: input.lifecycleAction,
                    deps: {
                        enqueueImmediate: deps.enqueueImmediate,
                        triggerQueue: deps.triggerQueue,
                        hasExistingImmediateSend: deps.hasExistingImmediateSend,
                    },
                })
            );
        }
    } else if (input.immediateEventKey && !recipient) {
        skippedReasons.push("missing_recipient");
    }

    if (reminderAction !== "none") {
        if (!recipient) {
            skippedReasons.push("missing_recipient_for_reminders");
            reminders = { action: reminderAction, ok: false, error: "MISSING_RECIPIENT", message: "No parent recipient." };
        } else {
            reminders = await runReminderAction({
                supabase: input.supabase,
                orgId: input.orgId,
                booking: input.booking,
                config,
                actorUserId,
                recipientPersonId: recipient.personId,
                orgTimezoneIana: loaded.orgTimezoneIana,
                reminderAction,
                scheduleGeneration,
                snapshots: reminderSnapshots,
                deps: {
                    scheduleReminders: deps.scheduleReminders,
                    replaceReminders: deps.replaceReminders,
                    cancelReminders: deps.cancelReminders,
                },
            });
        }
    }

    return { ok: true, disabled: false, skippedReasons, immediate, reminders };
}

/**
 * Send a tour **invitation** over every enabled channel the recipient can receive on.
 *
 * This is the invitation half of the same sender: it reuses the identical dedupe →
 * render → enqueue → dispatch path as booking lifecycle comms. It schedules no
 * reminders — there is no booking to remind anyone about yet.
 *
 * The caller owns the invitation itself (`mintTourInvitation`) and passes the already
 * minted subject. This function never mints, so a retry here cannot create a second
 * invitation.
 */
export async function orchestrateTourInvitationComms(input: {
    supabase: SupabaseClient;
    orgId: string;
    invitationId: string;
    opportunityId: string;
    locationId: string | null;
    config: TourCommsConfig;
    context: TourCommsTemplateContext;
    recipient: TourCommsParentRecipient;
    /** Changes only when the offered times change, so a resend of the same offer dedupes. */
    generationToken: string;
    deps?: TourCommsOrchestratorDeps;
}): Promise<TourCommsOrchestrationResult> {
    const deps = {
        enqueueImmediate: input.deps?.enqueueImmediate ?? enqueueCanonicalOutboundMessage,
        triggerQueue: input.deps?.triggerQueue ?? triggerBackendMessagesQueue,
        hasExistingImmediateSend: input.deps?.hasExistingImmediateSend ?? hasExistingTourCommsImmediateSend,
    };

    const subject: TourCommsSubject = {
        kind: "invitation",
        id: input.invitationId,
        opportunityId: input.opportunityId,
        locationId: input.locationId,
    };

    const skippedReasons: string[] = [];
    const immediate: TourCommsImmediateSendResult[] = [];

    for (const channel of TOUR_COMMS_CHANNELS) {
        if (!input.config.channels[channel]) {
            skippedReasons.push(`channel_disabled:${channel}`);
            continue;
        }
        if (!tourCommsRecipientHasChannel(input.recipient, channel)) {
            skippedReasons.push(`missing_${channel}`);
            continue;
        }
        const to = channel === "email" ? input.recipient.email! : input.recipient.smsTo!;
        immediate.push(
            await sendImmediateTourComms({
                supabase: input.supabase,
                orgId: input.orgId,
                subject,
                config: input.config,
                context: input.context,
                recipientPersonId: input.recipient.personId,
                recipientTo: to,
                channel,
                eventKey: "tour_invitation",
                generationToken: input.generationToken,
                scheduleGeneration: 1,
                lifecycleAction: "invite",
                deps,
            })
        );
    }

    return { ok: true, disabled: false, skippedReasons, immediate, reminders: { action: "none" } };
}

export async function orchestrateTourBookingConfirmed(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        booking: TourBookingRow;
        actorUserId?: string | null;
        actionModel?: TourCommsOrchestrateInput["actionModel"];
        deps?: TourCommsOrchestratorDeps;
    }
): Promise<TourCommsOrchestrationResult> {
    return orchestrateTourCommsForBooking({
        supabase,
        orgId: params.orgId,
        booking: params.booking,
        actorUserId: params.actorUserId,
        actionModel: params.actionModel ?? null,
        immediateEventKey: "tour_confirmation",
        immediateGenerationToken: "confirmed",
        lifecycleAction: "confirm",
        reminderAction: "schedule",
        deps: params.deps,
    });
}

export async function orchestrateTourBookingRescheduled(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        booking: TourBookingRow;
        actorUserId?: string | null;
        actionModel?: TourCommsOrchestrateInput["actionModel"];
        deps?: TourCommsOrchestratorDeps;
    }
): Promise<TourCommsOrchestrationResult> {
    return orchestrateTourCommsForBooking({
        supabase,
        orgId: params.orgId,
        booking: params.booking,
        actionModel: params.actionModel ?? null,
        actorUserId: params.actorUserId,
        immediateEventKey: "tour_reschedule",
        immediateGenerationToken: `rescheduled:${params.booking.start_at}`,
        lifecycleAction: "reschedule",
        reminderAction: "replace",
        deps: params.deps,
    });
}

export async function orchestrateTourBookingCanceled(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        booking: TourBookingRow;
        actorUserId?: string | null;
        actionModel?: TourCommsOrchestrateInput["actionModel"];
        deps?: TourCommsOrchestratorDeps;
    }
): Promise<TourCommsOrchestrationResult> {
    return orchestrateTourCommsForBooking({
        supabase,
        orgId: params.orgId,
        booking: params.booking,
        actionModel: params.actionModel ?? null,
        actorUserId: params.actorUserId,
        immediateEventKey: "tour_cancel",
        immediateGenerationToken: "canceled",
        lifecycleAction: "cancel",
        reminderAction: "cancel",
        deps: params.deps,
    });
}

export async function orchestrateTourBookingCompleted(
    supabase: SupabaseClient,
    params: { orgId: string; booking: TourBookingRow; actorUserId?: string | null; deps?: TourCommsOrchestratorDeps }
): Promise<TourCommsOrchestrationResult> {
    return orchestrateTourCommsForBooking({
        supabase,
        orgId: params.orgId,
        booking: params.booking,
        actorUserId: params.actorUserId,
        immediateEventKey: null,
        lifecycleAction: "complete",
        reminderAction: "cancel",
        deps: params.deps,
    });
}

export async function orchestrateTourBookingNoShow(
    supabase: SupabaseClient,
    params: { orgId: string; booking: TourBookingRow; actorUserId?: string | null; deps?: TourCommsOrchestratorDeps }
): Promise<TourCommsOrchestrationResult> {
    return orchestrateTourCommsForBooking({
        supabase,
        orgId: params.orgId,
        booking: params.booking,
        actorUserId: params.actorUserId,
        immediateEventKey: "tour_no_show_followup",
        immediateGenerationToken: "no_show",
        lifecycleAction: "no_show",
        reminderAction: "cancel",
        deps: params.deps,
    });
}

/** Best-effort wrapper for booking lifecycle hooks — never throws. */
export async function runTourCommsOrchestratorBestEffort(
    label: string,
    fn: () => Promise<TourCommsOrchestrationResult>
): Promise<TourCommsOrchestrationResult | null> {
    try {
        const result = await fn();
        if (result.skippedReasons.length > 0 || result.immediate.some((i) => i.status === "failed")) {
            console.info("[tour_comms]", label, {
                skipped: result.skippedReasons,
                immediate: result.immediate.map((i) => ({ channel: i.channel, status: i.status, reason: i.reason })),
                reminders: result.reminders,
            });
        }
        return result;
    } catch (e) {
        console.warn("[tour_comms]", label, e instanceof Error ? e.message : e);
        return null;
    }
}
