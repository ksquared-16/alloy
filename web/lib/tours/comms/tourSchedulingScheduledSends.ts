import type { SupabaseClient } from "@supabase/supabase-js";

import type { CommunicationScheduledSendRow } from "@/lib/communications/communicationScheduledSendsService";
import {
    TOUR_COMMS_SCHEDULED_SEND_METADATA,
    TOUR_SCHEDULING_SCHEDULED_SEND_SOURCE,
    type TourCommsChannel,
    type TourCommsConfig,
} from "@/lib/tours/comms/tourCommsConfig";
import type { TourAutomationConditionFacts } from "@/lib/tours/comms/tourCommsAutomationConditions";
import {
    buildTourReminderSchedulePlans,
    isTourBookingEligibleForReminders,
    type TourReminderSchedulePlan,
    type TourReminderSuppressionReason,
} from "@/lib/tours/comms/tourReminderTiming";

export const TOUR_REMINDER_EVENT_KEY = "tour_reminder" as const;

/** Batch 5 replaces placeholder snapshots with rendered templates at schedule time. */
export const TOUR_SCHEDULING_REMINDER_BODY_PLACEHOLDER = "[tour_scheduling:render_at_send]";
export const TOUR_SCHEDULING_REMINDER_SUBJECT_PLACEHOLDER = "[tour_scheduling:render_at_send]";

const PENDING_CLAIMED_STATUSES = ["pending", "claimed"] as const;

export type TourSchedulingReminderSnapshot = {
    subject?: string | null;
    body: string;
};

export type TourSchedulingReminderBookingRef = {
    id: string;
    start_at: string;
    status_key: string;
    timezone: string;
    location_id: string;
};

export type TourSchedulingReminderMetadata = {
    [TOUR_COMMS_SCHEDULED_SEND_METADATA.tourBookingId]: string;
    [TOUR_COMMS_SCHEDULED_SEND_METADATA.reminderKey]: string;
    [TOUR_COMMS_SCHEDULED_SEND_METADATA.scheduleGeneration]: number;
    [TOUR_COMMS_SCHEDULED_SEND_METADATA.eventKey]: typeof TOUR_REMINDER_EVENT_KEY;
    [TOUR_COMMS_SCHEDULED_SEND_METADATA.tourStartAt]: string;
    [TOUR_COMMS_SCHEDULED_SEND_METADATA.locationId]: string;
    [TOUR_COMMS_SCHEDULED_SEND_METADATA.quietHoursAdjusted]?: boolean;
    [TOUR_COMMS_SCHEDULED_SEND_METADATA.reason]?: string;
};

export type TourSchedulingReminderSuppressed = {
    channel: TourCommsChannel;
    reminderKey: string;
    offsetMinutes: number;
    reason: TourReminderSuppressionReason;
};

export type ScheduleTourSchedulingRemindersResult =
    | {
          ok: true;
          scheduled: CommunicationScheduledSendRow[];
          suppressed: TourSchedulingReminderSuppressed[];
      }
    | { ok: false; error: string; message: string };

export type ReplaceTourSchedulingRemindersResult =
    | (ScheduleTourSchedulingRemindersResult & { ok: true; canceledIds: string[]; canceledCount: number })
    | { ok: false; error: string; message: string };

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

function mapRow(data: Record<string, unknown>): CommunicationScheduledSendRow {
    return {
        id: String(data.id),
        org_id: String(data.org_id),
        created_by: String(data.created_by),
        proposal_id: data.proposal_id != null ? String(data.proposal_id) : null,
        entity_type: String(data.entity_type),
        entity_id: String(data.entity_id),
        recipient_person_id: String(data.recipient_person_id),
        channel: data.channel === "email" ? "email" : "sms",
        subject_snapshot: data.subject_snapshot != null ? String(data.subject_snapshot) : null,
        body_snapshot: String(data.body_snapshot),
        communication_provider_binding_id:
            data.communication_provider_binding_id != null ? String(data.communication_provider_binding_id) : null,
        scheduled_for: String(data.scheduled_for),
        status: String(data.status),
        approved_at: String(data.approved_at),
        approved_by: String(data.approved_by),
        communication_message_id: data.communication_message_id != null ? String(data.communication_message_id) : null,
        source: String(data.source),
        metadata: (data.metadata as Record<string, unknown>) ?? {},
        claimed_at: data.claimed_at != null ? String(data.claimed_at) : null,
        claim_token: data.claim_token != null ? String(data.claim_token) : null,
        created_at: String(data.created_at),
        updated_at: String(data.updated_at),
    };
}

function metadataTourBookingId(metadata: unknown): string {
    if (!isRecord(metadata)) return "";
    const v = metadata[TOUR_COMMS_SCHEDULED_SEND_METADATA.tourBookingId];
    return typeof v === "string" ? v.trim() : "";
}

export function buildTourSchedulingReminderMetadata(input: {
    tourBookingId: string;
    reminderKey: string;
    scheduleGeneration: number;
    tourStartAtIso: string;
    locationId: string;
    quietHoursAdjusted?: boolean;
    reason?: string;
}): TourSchedulingReminderMetadata {
    const metadata: TourSchedulingReminderMetadata = {
        [TOUR_COMMS_SCHEDULED_SEND_METADATA.tourBookingId]: input.tourBookingId,
        [TOUR_COMMS_SCHEDULED_SEND_METADATA.reminderKey]: input.reminderKey,
        [TOUR_COMMS_SCHEDULED_SEND_METADATA.scheduleGeneration]: input.scheduleGeneration,
        [TOUR_COMMS_SCHEDULED_SEND_METADATA.eventKey]: TOUR_REMINDER_EVENT_KEY,
        [TOUR_COMMS_SCHEDULED_SEND_METADATA.tourStartAt]: input.tourStartAtIso,
        [TOUR_COMMS_SCHEDULED_SEND_METADATA.locationId]: input.locationId,
    };
    if (input.quietHoursAdjusted) {
        metadata[TOUR_COMMS_SCHEDULED_SEND_METADATA.quietHoursAdjusted] = true;
    }
    if (input.reason?.trim()) {
        metadata[TOUR_COMMS_SCHEDULED_SEND_METADATA.reason] = input.reason.trim();
    }
    return metadata;
}

/** Satisfies `scheduled_for > approved_at` without shifting the send time. */
export function resolveTourSchedulingReminderApprovedAtIso(scheduledForIso: string, now: Date): string {
    const schedMs = Date.parse(scheduledForIso);
    const nowMs = now.getTime();
    if (Number.isNaN(schedMs)) return now.toISOString();
    const approvedMs = Math.min(nowMs, schedMs - 1000);
    return new Date(approvedMs).toISOString();
}

function resolveReminderSnapshots(
    channel: TourCommsChannel,
    snapshots?: Partial<Record<TourCommsChannel, TourSchedulingReminderSnapshot>>
): { subject: string | null; body: string } {
    const snap = snapshots?.[channel];
    if (snap) {
        return {
            subject: channel === "email" ? (snap.subject ?? TOUR_SCHEDULING_REMINDER_SUBJECT_PLACEHOLDER) : null,
            body: snap.body,
        };
    }
    return {
        subject: channel === "email" ? TOUR_SCHEDULING_REMINDER_SUBJECT_PLACEHOLDER : null,
        body: TOUR_SCHEDULING_REMINDER_BODY_PLACEHOLDER,
    };
}

function planToSuppressed(plan: Extract<TourReminderSchedulePlan, { kind: "suppressed" }>): TourSchedulingReminderSuppressed {
    return {
        channel: plan.channel,
        reminderKey: plan.reminderKey,
        offsetMinutes: plan.offsetMinutes,
        reason: plan.reason,
    };
}

export async function insertTourSchedulingReminderSend(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    recipientPersonId: string;
    actorUserId: string;
    channel: TourCommsChannel;
    scheduledForIso: string;
    booking: TourSchedulingReminderBookingRef;
    reminderKey: string;
    scheduleGeneration: number;
    quietHoursAdjusted?: boolean;
    communicationProviderBindingId?: string | null;
    snapshots?: Partial<Record<TourCommsChannel, TourSchedulingReminderSnapshot>>;
    now?: Date;
    reason?: string;
}): Promise<
    { ok: true; row: CommunicationScheduledSendRow } | { ok: false; error: string; message: string }
> {
    const now = params.now ?? new Date();
    const approvedAtIso = resolveTourSchedulingReminderApprovedAtIso(params.scheduledForIso, now);
    const schedMs = Date.parse(params.scheduledForIso);
    const apprMs = Date.parse(approvedAtIso);
    if (Number.isNaN(schedMs) || Number.isNaN(apprMs) || schedMs <= apprMs) {
        return {
            ok: false,
            error: "SCHEDULED_FOR_INVALID",
            message: "scheduled_for must be after approval time (DB constraint).",
        };
    }

    const { subject, body } = resolveReminderSnapshots(params.channel, params.snapshots);
    const metadata = buildTourSchedulingReminderMetadata({
        tourBookingId: params.booking.id,
        reminderKey: params.reminderKey,
        scheduleGeneration: params.scheduleGeneration,
        tourStartAtIso: params.booking.start_at,
        locationId: params.booking.location_id,
        quietHoursAdjusted: params.quietHoursAdjusted,
        reason: params.reason,
    });

    const { data, error } = await params.supabase
        .from("communication_scheduled_sends")
        .insert({
            org_id: params.orgId,
            created_by: params.actorUserId,
            proposal_id: null,
            entity_type: "opportunities",
            entity_id: params.opportunityId,
            recipient_person_id: params.recipientPersonId,
            channel: params.channel,
            subject_snapshot: subject,
            body_snapshot: body,
            communication_provider_binding_id: params.communicationProviderBindingId ?? null,
            scheduled_for: params.scheduledForIso,
            status: "pending",
            approved_at: approvedAtIso,
            approved_by: params.actorUserId,
            source: TOUR_SCHEDULING_SCHEDULED_SEND_SOURCE,
            metadata,
        })
        .select("*")
        .single();

    if (error || !data) {
        return { ok: false, error: "DB_INSERT_FAILED", message: error?.message ?? "Insert failed." };
    }
    return { ok: true, row: mapRow(data as Record<string, unknown>) };
}

/**
 * Cancel pending/claimed tour reminder rows for a booking.
 * Only touches `source = tour_scheduling`; sent/failed/historical rows are preserved.
 */
export async function cancelPendingTourSchedulingRemindersForBooking(params: {
    supabase: SupabaseClient;
    orgId: string;
    tourBookingId: string;
    opportunityId?: string;
}): Promise<
    { ok: true; canceledIds: string[]; canceledCount: number } | { ok: false; error: string; message: string }
> {
    let query = params.supabase
        .from("communication_scheduled_sends")
        .select("id, source, status, metadata")
        .eq("org_id", params.orgId)
        .eq("source", TOUR_SCHEDULING_SCHEDULED_SEND_SOURCE)
        .in("status", [...PENDING_CLAIMED_STATUSES])
        .filter("metadata->>tour_booking_id", "eq", params.tourBookingId);

    if (params.opportunityId) {
        query = query.eq("entity_id", params.opportunityId);
    }

    const { data: rows, error: readError } = await query;
    if (readError) {
        return { ok: false, error: "DB_READ_FAILED", message: readError.message };
    }

    const ids = (rows ?? [])
        .filter((row) => {
            const rec = row as Record<string, unknown>;
            if (String(rec.source) !== TOUR_SCHEDULING_SCHEDULED_SEND_SOURCE) return false;
            const st = String(rec.status ?? "").trim().toLowerCase();
            if (!PENDING_CLAIMED_STATUSES.includes(st as (typeof PENDING_CLAIMED_STATUSES)[number])) return false;
            return metadataTourBookingId(rec.metadata) === params.tourBookingId;
        })
        .map((row) => String((row as Record<string, unknown>).id));

    if (ids.length === 0) {
        return { ok: true, canceledIds: [], canceledCount: 0 };
    }

    const { data: updated, error: updateError } = await params.supabase
        .from("communication_scheduled_sends")
        .update({ status: "canceled" })
        .eq("org_id", params.orgId)
        .eq("source", TOUR_SCHEDULING_SCHEDULED_SEND_SOURCE)
        .in("id", ids)
        .in("status", [...PENDING_CLAIMED_STATUSES])
        .select("id");

    if (updateError) {
        return { ok: false, error: "DB_UPDATE_FAILED", message: updateError.message };
    }

    const canceledIds = (updated ?? []).map((r) => String((r as Record<string, unknown>).id));
    return { ok: true, canceledIds, canceledCount: canceledIds.length };
}

export type ScheduleTourSchedulingRemindersForBookingInput = {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    recipientPersonId: string;
    actorUserId: string;
    booking: TourSchedulingReminderBookingRef;
    config: TourCommsConfig;
    scheduleGeneration: number;
    communicationProviderBindingId?: string | null;
    orgTimezoneIana?: string | null;
    now?: Date;
    snapshots?: Partial<Record<TourCommsChannel, TourSchedulingReminderSnapshot>>;
    /** Facts for automation_conditions_v1 AND evaluation. */
    conditionFacts?: TourAutomationConditionFacts | null;
};

export async function scheduleTourSchedulingRemindersForBooking(
    input: ScheduleTourSchedulingRemindersForBookingInput
): Promise<ScheduleTourSchedulingRemindersResult> {
    const now = input.now ?? new Date();
    if (!input.config.enabled) {
        return { ok: true, scheduled: [], suppressed: [] };
    }
    if (!isTourBookingEligibleForReminders(input.booking.status_key)) {
        return { ok: true, scheduled: [], suppressed: [] };
    }

    const plans = buildTourReminderSchedulePlans({
        tourStartAtIso: input.booking.start_at,
        bookingStatusKey: input.booking.status_key,
        bookingTimezone: input.booking.timezone,
        config: input.config,
        orgTimezoneIana: input.orgTimezoneIana,
        now,
        conditionFacts: input.conditionFacts ?? {
            location_id: input.booking.location_id,
            site_id: input.booking.location_id,
            has_active_tour: true,
        },
    });

    const scheduled: CommunicationScheduledSendRow[] = [];
    const suppressed: TourSchedulingReminderSuppressed[] = [];

    for (const plan of plans) {
        if (plan.kind === "suppressed") {
            suppressed.push(planToSuppressed(plan));
            continue;
        }

        const inserted = await insertTourSchedulingReminderSend({
            supabase: input.supabase,
            orgId: input.orgId,
            opportunityId: input.opportunityId,
            recipientPersonId: input.recipientPersonId,
            actorUserId: input.actorUserId,
            channel: plan.channel,
            scheduledForIso: plan.scheduledForIso,
            booking: input.booking,
            reminderKey: plan.reminderKey,
            scheduleGeneration: input.scheduleGeneration,
            quietHoursAdjusted: plan.quietHoursAdjusted,
            communicationProviderBindingId: input.communicationProviderBindingId,
            snapshots: input.snapshots,
            now,
        });

        if (!inserted.ok) {
            return inserted;
        }
        scheduled.push(inserted.row);
    }

    return { ok: true, scheduled, suppressed };
}

/** Cancel pending tour reminders, then insert a fresh generation for eligible bookings. */
export async function replaceTourSchedulingRemindersForBooking(
    input: ScheduleTourSchedulingRemindersForBookingInput
): Promise<ReplaceTourSchedulingRemindersResult> {
    const canceled = await cancelPendingTourSchedulingRemindersForBooking({
        supabase: input.supabase,
        orgId: input.orgId,
        tourBookingId: input.booking.id,
        opportunityId: input.opportunityId,
    });
    if (!canceled.ok) return canceled;

    const scheduled = await scheduleTourSchedulingRemindersForBooking(input);
    if (!scheduled.ok) return scheduled;

    return {
        ok: true,
        canceledIds: canceled.canceledIds,
        canceledCount: canceled.canceledCount,
        scheduled: scheduled.scheduled,
        suppressed: scheduled.suppressed,
    };
}

export async function listPendingTourSchedulingRemindersForBooking(params: {
    supabase: SupabaseClient;
    orgId: string;
    tourBookingId: string;
    opportunityId?: string;
}): Promise<
    { ok: true; rows: CommunicationScheduledSendRow[] } | { ok: false; error: string; message: string }
> {
    let query = params.supabase
        .from("communication_scheduled_sends")
        .select("*")
        .eq("org_id", params.orgId)
        .eq("source", TOUR_SCHEDULING_SCHEDULED_SEND_SOURCE)
        .in("status", [...PENDING_CLAIMED_STATUSES])
        .filter("metadata->>tour_booking_id", "eq", params.tourBookingId)
        .order("scheduled_for", { ascending: true });

    if (params.opportunityId) {
        query = query.eq("entity_id", params.opportunityId);
    }

    const { data, error } = await query;
    if (error) {
        return { ok: false, error: "DB_LIST_FAILED", message: error.message };
    }

    const rows = (data ?? [])
        .map((r) => mapRow(r as Record<string, unknown>))
        .filter((row) => metadataTourBookingId(row.metadata) === params.tourBookingId);
    return { ok: true, rows };
}
