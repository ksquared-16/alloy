import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import { assertAllowedStatusKey } from "@/lib/admin/statusDefinitionsResolve";
import { validateStatusTransition } from "@/lib/admin/statusTransitionRules";
import type { TourBookingRow } from "@/lib/tours/bookings/types";
import { OPPORTUNITY_TOUR_COMPLETED_DATE_METADATA_KEY } from "@/lib/admin/actions/lifecycleActionMetadataKeys";
import { isValidIanaTimeZone, UTC_FALLBACK_IANA } from "@/lib/admin/timezoneContract";
import { emitDomainLifecycleStatusChangedEvent } from "@/lib/lifecycle/emitDomainLifecycleStatusChangedEvent";
import { emitDomainLifecycleSignalEvent } from "@/lib/lifecycle/emitDomainLifecycleSignalEvent";

/** V1: opportunity CRM status aligned to authoritative `tour_bookings` (scheduling SoT). */
export const TOUR_BOOKING_OPPORTUNITY_STATUS = {
    scheduled: "tour_scheduled",
    completed: "tour_completed",
    noShow: "tour_no_show",
} as const;

export type TourBookingOpportunityIntegrationKind =
    /** Mirror `metadata.tour_date` / `tour_time` and move opportunity toward `tour_scheduled`. */
    | "confirmed_mirror"
    /** Same mirror + status when an already-firm booking’s slot changes (in-place reschedule). */
    | "reschedule_mirror"
    | "completed"
    | "no_show"
    /** Sets needs-attention follow-up without changing opportunity status (V1). */
    | "canceled";

const TOUR_BOOKING_DOMAIN = "tour_booking" as const;

function resolveTourIntegrationActorUserId(
    booking: Pick<TourBookingRow, "requested_by_user_id">,
    actorUserId?: string | null,
): string | null {
    const explicit = actorUserId != null ? String(actorUserId).trim() : "";
    if (explicit) return explicit;
    const requested = booking.requested_by_user_id != null ? String(booking.requested_by_user_id).trim() : "";
    return requested || null;
}

function resolveIanaForMirror(timezoneIana: string): string {
    const t = String(timezoneIana ?? "").trim();
    return t && isValidIanaTimeZone(t) ? t : UTC_FALLBACK_IANA;
}

/**
 * Compatibility mirror for enrollment / queue consumers (`metadata.tour_date`, `metadata.tour_time`).
 * Wall fields are derived from `start_at` in the booking’s timezone (HTML `date` / `time` shapes).
 */
export function deriveTourMetadataMirrorFromBooking(startAtIso: string, timezoneIana: string): { tour_date: string; tour_time: string } {
    const tz = resolveIanaForMirror(timezoneIana);
    const d = new Date(startAtIso);
    if (Number.isNaN(d.getTime())) {
        throw new RangeError("tour_booking opportunity mirror: invalid start_at");
    }
    return {
        tour_date: formatInTimeZone(d, tz, "yyyy-MM-dd"),
        tour_time: formatInTimeZone(d, tz, "HH:mm"),
    };
}

function asMetadataRecord(raw: unknown): Record<string, unknown> {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return { ...(raw as Record<string, unknown>) };
    return {};
}

type OpportunitySyncRow = {
    id: string;
    org_id: string;
    status_key: string | null;
    metadata: unknown;
    work_unit_id: string | null;
};

async function loadOpportunityForTourSync(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string
): Promise<OpportunitySyncRow | null> {
    const { data, error } = await supabase
        .from("opportunities")
        .select("id, org_id, status_key, metadata, work_unit_id")
        .eq("id", opportunityId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (error) throw new Error(`opportunities (tour sync): ${error.message}`);
    return (data as OpportunitySyncRow | null) ?? null;
}

async function resolveDepartmentIdForWorkUnit(
    supabase: SupabaseClient,
    orgId: string,
    workUnitId: string | null | undefined
): Promise<string | null> {
    const wu = workUnitId != null ? String(workUnitId).trim() : "";
    if (!wu) return null;
    const { data, error } = await supabase.from("work_units").select("department_id").eq("id", wu).eq("org_id", orgId).maybeSingle();
    if (error) throw new Error(`work_units (tour sync): ${error.message}`);
    return (data as { department_id?: string | null } | null)?.department_id != null
        ? String((data as { department_id: string | null }).department_id).trim() || null
        : null;
}

async function assertTransition(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string,
    fromStatusKey: string | null,
    toStatusKey: string,
    mergedMetadata: Record<string, unknown>,
    workUnitId: string | null,
    bookingId: string,
    /** Enrollment rules (e.g. `tour_scheduled`) may require `tour_date` / `tour_time` on `required_payload_fields`. */
    payloadExtras?: Record<string, unknown>
): Promise<void> {
    const departmentId = await resolveDepartmentIdForWorkUnit(supabase, orgId, workUnitId);
    const t = await validateStatusTransition({
        supabase,
        orgId,
        entityType: "opportunities",
        entityId: opportunityId,
        departmentId,
        workUnitId,
        actionKey: null,
        fromStatusKey,
        toStatusKey,
        currentMetadata: mergedMetadata,
        payload: { source: TOUR_BOOKING_DOMAIN, booking_id: bookingId, ...(payloadExtras ?? {}) },
    });
    if (!t.ok) {
        throw new Error(`tour_booking: opportunity transition blocked — ${t.message}`);
    }
}

function tourBookingEventMetadata(
    booking: TourBookingRow,
    opportunityId: string,
    correlationId?: string | null,
): Record<string, unknown> {
    return {
        source: TOUR_BOOKING_DOMAIN,
        booking_id: booking.id,
        opportunity_id: opportunityId,
        location_id: booking.location_id,
        start_at: booking.start_at,
        end_at: booking.end_at,
        timezone: booking.timezone,
        status_key: booking.status_key,
        ...(correlationId ? { correlation_id: correlationId } : {}),
    };
}

async function patchOpportunityTourMirrorAndScheduledStatus(input: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    booking: TourBookingRow;
    actorUserId?: string | null;
    correlationId?: string | null;
}): Promise<void> {
    const { supabase, orgId, opportunityId, booking, actorUserId, correlationId } = input;
    const target = TOUR_BOOKING_OPPORTUNITY_STATUS.scheduled;
    const allowed = await assertAllowedStatusKey(supabase, orgId, "opportunities", target);
    if (!allowed.ok) {
        throw new Error(`tour_booking: ${allowed.message}`);
    }

    const opp = await loadOpportunityForTourSync(supabase, orgId, opportunityId);
    if (!opp) throw new Error("tour_booking: opportunity not found for integration");

    const md = asMetadataRecord(opp.metadata);
    const mirror = deriveTourMetadataMirrorFromBooking(booking.start_at, booking.timezone);
    const nextMd: Record<string, unknown> = { ...md, ...mirror };

    await assertTransition(supabase, orgId, opportunityId, opp.status_key ?? null, target, nextMd, opp.work_unit_id, booking.id, {
        tour_date: mirror.tour_date,
        tour_time: mirror.tour_time,
    });

    const { error } = await emitDomainLifecycleStatusChangedEvent({
        supabase,
        orgId,
        entityType: "opportunities",
        entityId: opportunityId,
        nextStatusKey: target,
        additionalPatch: { metadata: nextMd },
        actorUserId: resolveTourIntegrationActorUserId(booking, actorUserId),
        domain: TOUR_BOOKING_DOMAIN,
        domainEntityId: booking.id,
        eventMetadata: tourBookingEventMetadata(booking, opportunityId, correlationId),
        normalizeContext: "tour_booking:confirmed_mirror",
    });
    if (error) {
        throw new Error(`tour_booking: opportunity update failed — ${error.message}`);
    }
}

async function patchOpportunityTerminalFromTour(input: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    booking: TourBookingRow;
    newOppStatus: string;
    actorUserId?: string | null;
    correlationId?: string | null;
}): Promise<void> {
    const { supabase, orgId, opportunityId, booking, newOppStatus, actorUserId, correlationId } = input;
    const allowed = await assertAllowedStatusKey(supabase, orgId, "opportunities", newOppStatus);
    if (!allowed.ok) {
        throw new Error(`tour_booking: ${allowed.message}`);
    }

    const opp = await loadOpportunityForTourSync(supabase, orgId, opportunityId);
    if (!opp) throw new Error("tour_booking: opportunity not found for integration");

    const md = asMetadataRecord(opp.metadata);
    if (newOppStatus === TOUR_BOOKING_OPPORTUNITY_STATUS.completed) {
        const existing = md[OPPORTUNITY_TOUR_COMPLETED_DATE_METADATA_KEY];
        if (existing == null || String(existing).trim() === "") {
            md[OPPORTUNITY_TOUR_COMPLETED_DATE_METADATA_KEY] = new Date().toISOString().slice(0, 10);
        }
    }
    await assertTransition(supabase, orgId, opportunityId, opp.status_key ?? null, newOppStatus, md, opp.work_unit_id, booking.id);

    const { error } = await emitDomainLifecycleStatusChangedEvent({
        supabase,
        orgId,
        entityType: "opportunities",
        entityId: opportunityId,
        nextStatusKey: newOppStatus,
        additionalPatch: { metadata: md },
        actorUserId: resolveTourIntegrationActorUserId(booking, actorUserId),
        domain: TOUR_BOOKING_DOMAIN,
        domainEntityId: booking.id,
        eventMetadata: tourBookingEventMetadata(booking, opportunityId, correlationId),
        normalizeContext: `tour_booking:${newOppStatus}`,
    });
    if (error) {
        throw new Error(`tour_booking: opportunity update failed — ${error.message}`);
    }
}

/**
 * Keep `opportunities` metadata + `status_key` aligned for enrollment CRM / queue consumers.
 * Call after the `tour_bookings` row is committed, before tour lifecycle workflow events.
 */
export async function applyTourBookingOpportunityIntegration(
    supabase: SupabaseClient,
    args: {
        booking: TourBookingRow;
        kind: TourBookingOpportunityIntegrationKind;
        actorUserId?: string | null;
        correlationId?: string | null;
    }
): Promise<void> {
    const { booking, kind, actorUserId, correlationId } = args;
    const orgId = String(booking.org_id).trim();
    const opportunityId = String(booking.opportunity_id).trim();
    if (!orgId || !opportunityId) return;

    if (kind === "canceled") {
        const { error } = await emitDomainLifecycleSignalEvent({
            supabase,
            orgId,
            opportunityId,
            domain: TOUR_BOOKING_DOMAIN,
            signal: "canceled",
            actorUserId: resolveTourIntegrationActorUserId(booking, actorUserId),
            metadata: { booking_id: booking.id },
        });
        if (error) {
            throw new Error(`tour_booking: cancel signal failed — ${error.message}`);
        }
        return;
    }

    if (kind === "confirmed_mirror" || kind === "reschedule_mirror") {
        if (booking.status_key !== "confirmed" && booking.status_key !== "rescheduled") {
            return;
        }
        await patchOpportunityTourMirrorAndScheduledStatus({
            supabase,
            orgId,
            opportunityId,
            booking,
            actorUserId,
            correlationId,
        });
        return;
    }

    if (kind === "completed") {
        await patchOpportunityTerminalFromTour({
            supabase,
            orgId,
            opportunityId,
            booking,
            newOppStatus: TOUR_BOOKING_OPPORTUNITY_STATUS.completed,
            actorUserId,
            correlationId,
        });
        return;
    }

    if (kind === "no_show") {
        await patchOpportunityTerminalFromTour({
            supabase,
            orgId,
            opportunityId,
            booking,
            newOppStatus: TOUR_BOOKING_OPPORTUNITY_STATUS.noShow,
            actorUserId,
            correlationId,
        });
    }
}
