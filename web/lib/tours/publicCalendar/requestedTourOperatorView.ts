/**
 * What an administrator needs to know about a case's requested tour (S7), read on demand.
 *
 * Nothing here is stored: whether the time is still offered, the booking's current status,
 * what happened to the confirmation and the alternatives are all read from their owners
 * (the slot engine, `tour_bookings`, `communication_messages`) at view time. The record on
 * the case says only what was requested and how acceptance resolved it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import { isValidIanaTimeZone, UTC_FALLBACK_IANA } from "@/lib/admin/timezoneContract";
import { findOfferedTourSlot, listPublicTourSlots, type PublicTourSlot } from "./publicTourCalendarServer";
import { readRequestedTour, type RequestedTourRecord, type RequestedTourRescheduleReason } from "./requestedTour";

export type RequestedTourOperatorView = {
    state: RequestedTourRecord["state"];
    /** Accepted / not yet / declined — from the case's own outcome, never a second flag. */
    acceptance: "pending" | "accepted" | "not_accepted";
    headline: string;
    reason: RequestedTourRescheduleReason | null;
    reasonLabel: string | null;
    requested: { startAt: string; endAt: string; timezone: string; label: string };
    location: { id: string; label: string };
    requestedAt: string;
    /** Pending only: is this exact time still offered right now? Null when it could not be checked. */
    stillAvailable: boolean | null;
    opportunityId: string | null;
    booking: { id: string; status: string; label: string } | null;
    comms: { status: string; detail: string | null } | null;
    /** Current openings from the canonical engine, when the requested time cannot be booked. */
    alternatives: Array<PublicTourSlot & { label: string }>;
    error: string | null;
};

const REASON_LABEL: Record<RequestedTourRescheduleReason, string> = {
    slot_unavailable: "The requested time is no longer available (it filled up or the schedule changed).",
    calendar_closed: "The location's operating calendar now closes the requested time.",
    too_soon: "The requested time has passed or is too soon to book.",
    existing_active_tour: "This lead already has an active tour; the existing tour was kept.",
    location_mismatch: "The lead belongs to a different location than the requested tour.",
};

function tz(t: string | null | undefined): string {
    const v = String(t ?? "").trim();
    return v && isValidIanaTimeZone(v) ? v : UTC_FALLBACK_IANA;
}

/** "Tue, Nov 3, 2026 · 10:00 AM – 10:45 AM PST" in the tour location's zone. */
export function formatRequestedTourInterval(startAt: string, endAt: string, timezone: string): string {
    const z = tz(timezone);
    const day = formatInTimeZone(new Date(startAt), z, "EEE, MMM d, yyyy");
    const start = formatInTimeZone(new Date(startAt), z, "h:mm a");
    const end = formatInTimeZone(new Date(endAt), z, "h:mm a zzz");
    return `${day} · ${start} – ${end}`;
}

function headlineFor(record: RequestedTourRecord, acceptance: RequestedTourOperatorView["acceptance"], bookingStatus: string | null): string {
    if (acceptance === "not_accepted") return "Tour request not accepted — no tour was booked";
    switch (record.state) {
        case "pending_acceptance":
            return "Tour requested — pending acceptance (not booked)";
        case "booked":
            if (bookingStatus === "pending_approval") return "Tour booked — awaiting tour approval";
            if (bookingStatus === "canceled") return "Tour was booked, then canceled";
            return "Tour booked";
        case "needs_rescheduling":
            return "Lead accepted — tour needs rescheduling";
        case "failed":
            return "Lead accepted — tour booking did not complete (approve again to retry)";
    }
}

export async function buildRequestedTourOperatorView(
    supabase: SupabaseClient,
    args: { orgId: string; caseId: string; now?: Date }
): Promise<RequestedTourOperatorView | null> {
    const { data: c, error } = await supabase
        .from("processing_cases")
        .select("id, status, metadata")
        .eq("org_id", args.orgId)
        .eq("id", args.caseId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!c) return null;
    const row = c as { status: string; metadata: Record<string, unknown> | null };
    const record = readRequestedTour(row.metadata);
    if (!record) return null;

    const outcome = (row.metadata?.operational_result ?? null) as { kind?: unknown } | null;
    const acceptance: RequestedTourOperatorView["acceptance"] =
        row.status === "completed" && outcome?.kind === "lead"
            ? "accepted"
            : row.status === "completed" || row.status === "archived"
              ? "not_accepted"
              : "pending";

    const { data: loc } = await supabase
        .from("locations")
        .select("label")
        .eq("org_id", args.orgId)
        .eq("id", record.location_id)
        .maybeSingle();
    const locationLabel = ((loc as { label?: string } | null)?.label ?? "").trim() || "Location";

    let booking: RequestedTourOperatorView["booking"] = null;
    if (record.booking_id) {
        const { data: b } = await supabase
            .from("tour_bookings")
            .select("id, status_key, start_at, end_at, timezone")
            .eq("org_id", args.orgId)
            .eq("id", record.booking_id)
            .maybeSingle();
        const br = b as { id: string; status_key: string; start_at: string; end_at: string; timezone: string } | null;
        if (br) booking = { id: br.id, status: br.status_key, label: formatRequestedTourInterval(br.start_at, br.end_at, br.timezone) };
    }

    const startAt = new Date(record.start_at);
    const endAt = new Date(record.end_at);
    let stillAvailable: boolean | null = null;
    if (record.state === "pending_acceptance" && acceptance === "pending") {
        try {
            stillAvailable = Boolean(
                await findOfferedTourSlot(supabase, { orgId: args.orgId, locationId: record.location_id, startAt, endAt, now: args.now })
            );
        } catch {
            stillAvailable = null;
        }
    }

    let alternatives: RequestedTourOperatorView["alternatives"] = [];
    const wantsAlternatives =
        (record.state === "needs_rescheduling" && record.reason !== "existing_active_tour") ||
        (record.state === "pending_acceptance" && stillAvailable === false);
    if (wantsAlternatives) {
        try {
            const from = args.now ?? new Date();
            const to = new Date(from.getTime() + 21 * 24 * 60 * 60 * 1000);
            const slots = await listPublicTourSlots(supabase, { orgId: args.orgId, locationId: record.location_id }, { from, to }, from);
            alternatives = slots.slice(0, 6).map((s) => ({ ...s, label: formatRequestedTourInterval(s.start_at, s.end_at, s.timezone) }));
        } catch {
            alternatives = [];
        }
    }

    const reason = record.state === "needs_rescheduling" ? (record.reason ?? "slot_unavailable") : null;
    return {
        state: record.state,
        acceptance,
        headline: headlineFor(record, acceptance, booking?.status ?? record.booking_status ?? null),
        reason,
        reasonLabel: reason ? REASON_LABEL[reason] : null,
        requested: {
            startAt: record.start_at,
            endAt: record.end_at,
            timezone: record.timezone,
            label: formatRequestedTourInterval(record.start_at, record.end_at, record.timezone),
        },
        location: { id: record.location_id, label: locationLabel },
        requestedAt: record.requested_at,
        stillAvailable,
        opportunityId: record.opportunity_id ?? null,
        booking,
        comms: record.comms ?? null,
        alternatives,
        error: record.state === "failed" ? (record.error ?? null) : null,
    };
}

export type RequestedTourAttention = {
    caseId: string;
    state: "needs_rescheduling" | "failed";
    reason: RequestedTourRescheduleReason | null;
    message: string;
    requestedLabel: string;
};

/**
 * Accepted public tour requests on this Opportunity that did not become a booking — the
 * enrollment-side half of S7-E. Derived on read from the Processing cases that name the
 * Opportunity; once an operator schedules a tour (an active booking exists) a reschedule
 * request is resolved and drops out. No stored flag, no Work Item.
 */
export async function listRequestedTourAttentionForOpportunity(
    supabase: SupabaseClient,
    args: { orgId: string; opportunityId: string; hasActiveBooking: boolean }
): Promise<RequestedTourAttention[]> {
    const { data, error } = await supabase
        .from("processing_cases")
        .select("id, metadata")
        .eq("org_id", args.orgId)
        .eq("metadata->requested_tour->>opportunity_id", args.opportunityId)
        .in("metadata->requested_tour->>state", ["needs_rescheduling", "failed"])
        .limit(10);
    if (error) throw new Error(error.message);
    const out: RequestedTourAttention[] = [];
    for (const row of (data ?? []) as { id: string; metadata: unknown }[]) {
        const r = readRequestedTour(row.metadata);
        if (!r || (r.state !== "needs_rescheduling" && r.state !== "failed")) continue;
        // Scheduling a tour resolves a reschedule; an existing-tour conflict stays visible beside it.
        if (args.hasActiveBooking && r.state === "needs_rescheduling" && r.reason !== "existing_active_tour") continue;
        const reason = r.state === "needs_rescheduling" ? (r.reason ?? "slot_unavailable") : null;
        out.push({
            caseId: row.id,
            state: r.state,
            reason,
            message: reason
                ? REASON_LABEL[reason]
                : "The tour step did not complete when this lead was accepted; approve the Processing case again to retry.",
            requestedLabel: formatRequestedTourInterval(r.start_at, r.end_at, r.timezone),
        });
    }
    return out;
}
