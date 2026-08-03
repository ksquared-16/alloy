import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import type { TourBookingRow } from "@/lib/tours/bookings/types";
import { OPPORTUNITY_TOUR_COMPLETED_DATE_METADATA_KEY } from "@/lib/admin/actions/lifecycleActionMetadataKeys";
import { isValidIanaTimeZone, UTC_FALLBACK_IANA } from "@/lib/admin/timezoneContract";
import { emitDomainLifecycleSignalEvent } from "@/lib/lifecycle/emitDomainLifecycleSignalEvent";

/**
 * Legacy opportunity CRM status vocabulary for the tour position. RETIRED as durable
 * `opportunities.status_key` values by the enrollment status-collapse migration
 * (`20260711000100_enrollment_status_collapse_and_stage_key.sql`): `opportunities.status_key` is now
 * `{open, closed}` and the tour position lives on `stage_key` / Business Process. Kept only as the
 * canonical domain-SIGNAL names below (`scheduled`/`completed`/`no_show`) — NEVER written to
 * `status_key` (doing so is what produced "status_key is not defined for this entity in
 * status_definitions"). Retained export for back-compat readers.
 */
export const TOUR_BOOKING_OPPORTUNITY_STATUS = {
    scheduled: "tour_scheduled",
    completed: "tour_completed",
    noShow: "tour_no_show",
} as const;

/** Canonical domain-signal names the tour booking emits; configured stage automation acts on these. */
const TOUR_BOOKING_SIGNAL = {
    scheduled: "scheduled",
    completed: "completed",
    noShow: "no_show",
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

/**
 * Result of the integration. `undo` is the inverse of the durable write, for the Platform
 * Transaction Contract's compensation pass; absent when nothing durable was written.
 */
export type TourBookingOpportunityIntegrationResult = {
    undo?: () => Promise<void>;
    /**
     * Set when the durable mirror applied but the CONFIGURED stage signal did not —
     * typically because the tenant has no transition authored for this signal.
     *
     * This is a downstream consequence, not a booking failure. The caller records it
     * as operator-visible follow-up and keeps the booking. A genuine write failure
     * still throws; only an unapplied stage rule lands here.
     */
    stageSyncFailure?: { domain: string; signal: string; message: string };
};

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

/**
 * Persist the compatibility METADATA mirror (`tour_date` / `tour_time`) on the opportunity and emit a
 * configured tour domain signal. It NEVER writes `opportunities.status_key`: post enrollment
 * status-collapse the durable status is `{open, closed}` and the tour position lives on `stage_key` /
 * Business Process, advanced by configured stage-automation rules that act on the domain signal.
 */
async function mirrorTourMetadataAndSignal(input: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    booking: TourBookingRow;
    signal: string;
    /** Record the tour-completed date in metadata (completion only). */
    recordCompletedDate?: boolean;
    actorUserId?: string | null;
    correlationId?: string | null;
}): Promise<TourBookingOpportunityIntegrationResult> {
    const { supabase, orgId, opportunityId, booking, signal, recordCompletedDate, actorUserId, correlationId } = input;

    const opp = await loadOpportunityForTourSync(supabase, orgId, opportunityId);
    if (!opp) throw new Error("tour_booking: opportunity not found for integration");

    // Captured before the write so the surrounding transaction has an exact inverse.
    const priorMetadata = opp.metadata;
    const md = asMetadataRecord(opp.metadata);
    // Scheduling signals mirror the wall date/time; completion records the completed date.
    if (signal === TOUR_BOOKING_SIGNAL.scheduled) {
        Object.assign(md, deriveTourMetadataMirrorFromBooking(booking.start_at, booking.timezone));
    }
    if (recordCompletedDate) {
        const existing = md[OPPORTUNITY_TOUR_COMPLETED_DATE_METADATA_KEY];
        if (existing == null || String(existing).trim() === "") {
            md[OPPORTUNITY_TOUR_COMPLETED_DATE_METADATA_KEY] = new Date().toISOString().slice(0, 10);
        }
    }

    const { error: updErr } = await supabase
        .from("opportunities")
        .update({ metadata: md })
        .eq("id", opportunityId)
        .eq("org_id", orgId);
    if (updErr) throw new Error(`tour_booking: opportunity metadata mirror failed — ${updErr.message}`);

    const undo = async () => {
        const { error } = await supabase
            .from("opportunities")
            .update({ metadata: priorMetadata })
            .eq("id", opportunityId)
            .eq("org_id", orgId);
        if (error) throw new Error(`tour_booking: restore opportunity mirror failed — ${error.message}`);
    };

    // How the opportunity advances for this tour event is CONFIGURED (generic domain-signal → stage
    // automation), never a hardcoded status/stage target — the same seam the "canceled" signal uses.
    const { error: sigErr } = await emitDomainLifecycleSignalEvent({
        supabase,
        orgId,
        opportunityId,
        domain: TOUR_BOOKING_DOMAIN,
        signal,
        actorUserId: resolveTourIntegrationActorUserId(booking, actorUserId),
        metadata: tourBookingEventMetadata(booking, opportunityId, correlationId),
    });
    if (sigErr) {
        // DIRECTOR BOUNDARY: the booking is domain truth; stage movement is a downstream
        // consequence. An unapplied stage rule (typically none configured for this signal
        // on this tenant) must not revoke a tour the parent successfully booked.
        //
        // The mirror is KEPT rather than undone — it is truthful, the tour really exists —
        // and the caller turns this into operator-visible, retryable follow-up. Reporting
        // it beats silently pretending the process synchronized.
        return { undo, stageSyncFailure: { domain: TOUR_BOOKING_DOMAIN, signal, message: sigErr.message } };
    }

    return { undo };
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
): Promise<TourBookingOpportunityIntegrationResult> {
    const { booking, kind, actorUserId, correlationId } = args;
    const orgId = String(booking.org_id).trim();
    const opportunityId = String(booking.opportunity_id).trim();
    if (!orgId || !opportunityId) return {};

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
        return {};
    }

    if (kind === "confirmed_mirror" || kind === "reschedule_mirror") {
        if (booking.status_key !== "confirmed" && booking.status_key !== "rescheduled") {
            return {};
        }
        return mirrorTourMetadataAndSignal({
            supabase,
            orgId,
            opportunityId,
            booking,
            signal: TOUR_BOOKING_SIGNAL.scheduled,
            actorUserId,
            correlationId,
        });
    }

    if (kind === "completed") {
        return mirrorTourMetadataAndSignal({
            supabase,
            orgId,
            opportunityId,
            booking,
            signal: TOUR_BOOKING_SIGNAL.completed,
            recordCompletedDate: true,
            actorUserId,
            correlationId,
        });
    }

    if (kind === "no_show") {
        return mirrorTourMetadataAndSignal({
            supabase,
            orgId,
            opportunityId,
            booking,
            signal: TOUR_BOOKING_SIGNAL.noShow,
            actorUserId,
            correlationId,
        });
    }

    return {};
}
