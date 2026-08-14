/**
 * Attach canonical active-Tour facts onto opportunity (family) projection rows.
 *
 * Used before Work View predicate evaluation so a configured family-grain Tours lens can admit
 * families by operational Tour truth (`has_active_tour` / booking wall date) without requiring
 * `stage_key = tour` or a QueueService id-IN bypass.
 *
 * Fail-open: on load error, returns original rows (predicates that need the fact simply miss).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS } from "@/lib/tours/constants";
import { deriveTourMetadataMirrorFromBooking } from "@/lib/tours/opportunity/tourBookingOpportunityIntegration";

export type ActiveTourFactAttachment = {
    has_active_tour: boolean;
    tour_booking_id: string | null;
    tour_status_key: string | null;
    tour_start_at: string | null;
    tour_timezone: string | null;
    tour_date: string | null;
    tour_time: string | null;
};

const EMPTY_FACT: ActiveTourFactAttachment = {
    has_active_tour: false,
    tour_booking_id: null,
    tour_status_key: null,
    tour_start_at: null,
    tour_timezone: null,
    tour_date: null,
    tour_time: null,
};

type BookingLite = {
    id: string;
    opportunity_id: string;
    status_key: string;
    start_at: string;
    timezone: string | null;
};

function wallFromBooking(startAt: string, timezone: string | null): { tour_date: string | null; tour_time: string | null } {
    try {
        const w = deriveTourMetadataMirrorFromBooking(startAt, timezone ?? "UTC");
        return { tour_date: w.tour_date ?? null, tour_time: w.tour_time ?? null };
    } catch {
        return { tour_date: null, tour_time: null };
    }
}

/** Pure merge: stamp `_has_active_tour` + SoT wall date onto a row when a booking exists. */
export function mergeActiveTourFactOntoOpportunityRow(
    row: Record<string, unknown>,
    fact: ActiveTourFactAttachment | null | undefined,
): Record<string, unknown> {
    const f = fact ?? EMPTY_FACT;
    const next: Record<string, unknown> = {
        ...row,
        _has_active_tour: f.has_active_tour,
        has_active_tour: f.has_active_tour,
        _active_tour_booking_id: f.tour_booking_id,
        _active_tour_status_key: f.tour_status_key,
        _active_tour_start_at: f.tour_start_at,
    };
    if (!f.has_active_tour || !f.tour_date) return next;

    // Prefer booking SoT for Tour date predicates so metadata drift cannot hide a booked Tour.
    const md = row.metadata;
    const baseMd =
        md && typeof md === "object" && !Array.isArray(md) ? { ...(md as Record<string, unknown>) } : {};
    next.metadata = {
        ...baseMd,
        tour_date: f.tour_date,
        ...(f.tour_time ? { tour_time: f.tour_time } : {}),
    };
    return next;
}

/**
 * Batch-load active non-terminal `tour_bookings` for the given opportunity rows and attach facts.
 * When multiple active bookings exist for one opportunity, the soonest `start_at` wins.
 */
export async function attachActiveTourFactsToOpportunityRows(params: {
    supabase: SupabaseClient;
    orgId: string;
    rows: Array<Record<string, unknown>>;
    logLabel?: string;
}): Promise<Array<Record<string, unknown>>> {
    const { rows } = params;
    if (!rows.length) return rows;
    const label = params.logLabel ?? "active-tour-facts";
    const opportunityIds = [
        ...new Set(rows.map((row) => (typeof row.id === "string" ? row.id.trim() : "")).filter(Boolean)),
    ];
    if (!opportunityIds.length) return rows;

    try {
        const { data, error } = await params.supabase
            .from("tour_bookings")
            .select("id, opportunity_id, status_key, start_at, timezone")
            .eq("org_id", params.orgId)
            .in("opportunity_id", opportunityIds)
            .in("status_key", [...TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS]);
        if (error) {
            console.warn(`[${label}] active tour booking lookup failed; predicates may miss`, error.message);
            return rows;
        }

        const bestByOpportunity = new Map<string, BookingLite>();
        for (const raw of data ?? []) {
            const r = raw as BookingLite;
            const oppId = String(r.opportunity_id ?? "").trim();
            const startAt = String(r.start_at ?? "").trim();
            if (!oppId || !startAt) continue;
            const prev = bestByOpportunity.get(oppId);
            if (!prev || startAt < String(prev.start_at)) {
                bestByOpportunity.set(oppId, {
                    id: String(r.id ?? "").trim(),
                    opportunity_id: oppId,
                    status_key: String(r.status_key ?? "").trim(),
                    start_at: startAt,
                    timezone: typeof r.timezone === "string" ? r.timezone : null,
                });
            }
        }

        return rows.map((row) => {
            const id = typeof row.id === "string" ? row.id.trim() : "";
            const booking = id ? bestByOpportunity.get(id) : undefined;
            if (!booking) {
                return mergeActiveTourFactOntoOpportunityRow(row, EMPTY_FACT);
            }
            const wall = wallFromBooking(booking.start_at, booking.timezone);
            return mergeActiveTourFactOntoOpportunityRow(row, {
                has_active_tour: true,
                tour_booking_id: booking.id || null,
                tour_status_key: booking.status_key || null,
                tour_start_at: booking.start_at,
                tour_timezone: booking.timezone,
                tour_date: wall.tour_date,
                tour_time: wall.tour_time,
            });
        });
    } catch (err) {
        console.warn(`[${label}] active tour facts attach failed; using rows without tour facts`, err);
        return rows;
    }
}
