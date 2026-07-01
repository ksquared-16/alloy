import type { SupabaseClient } from "@supabase/supabase-js";
import {
    confirmTourBooking,
    markTourBookingCompleted,
    markTourBookingNoShow,
} from "@/lib/tours/bookings/tourBookingService";
import { TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS } from "@/lib/tours/constants";
import type { ExecuteAdminActionCtx } from "@/lib/admin/actions/executeAdminAction";

export type TourBookingActionError = { ok: false; error: string; status: number };

const ACTIVE = new Set<string>(TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS);

export async function resolvePrimaryActiveTourBookingId(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string
): Promise<string | null> {
    const { data, error } = await supabase
        .from("tour_bookings")
        .select("id, status_key, start_at")
        .eq("org_id", orgId)
        .eq("opportunity_id", opportunityId)
        .in("status_key", [...TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS])
        .order("start_at", { ascending: true })
        .limit(1)
        .maybeSingle();
    if (error || !data) return null;
    const sk = (data as { status_key?: string }).status_key ?? "";
    if (!ACTIVE.has(sk)) return null;
    return (data as { id: string }).id?.trim() || null;
}

export async function executeConfirmTourAction(
    supabase: SupabaseClient,
    ctx: ExecuteAdminActionCtx,
    opportunityId: string,
    bookingIdFromPayload?: string | null
): Promise<{ ok: true; booking_id: string } | TourBookingActionError> {
    const bookingId =
        (bookingIdFromPayload ?? "").trim() ||
        (await resolvePrimaryActiveTourBookingId(supabase, ctx.orgId, opportunityId));
    if (!bookingId) {
        return { ok: false, error: "No active tour booking found for this record.", status: 400 };
    }
    try {
        const row = await confirmTourBooking(supabase, ctx.orgId, bookingId, { actorUserId: ctx.userId });
        return { ok: true, booking_id: row.id };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Confirm tour failed.", status: 400 };
    }
}

export type TourOutcome = "completed" | "no_show";

export async function executeRecordTourOutcomeAction(
    supabase: SupabaseClient,
    ctx: ExecuteAdminActionCtx,
    opportunityId: string,
    merged: Record<string, unknown>
): Promise<{ ok: true; booking_id: string; outcome: TourOutcome } | TourBookingActionError> {
    const outcomeRaw = merged.outcome != null ? String(merged.outcome).trim() : "";
    const outcome: TourOutcome | "" =
        outcomeRaw === "completed" || outcomeRaw === "no_show" ? outcomeRaw : "";
    if (!outcome) {
        return { ok: false, error: "Tour outcome is required (completed or no_show).", status: 400 };
    }

    const bookingId =
        (merged.booking_id != null ? String(merged.booking_id).trim() : "") ||
        (await resolvePrimaryActiveTourBookingId(supabase, ctx.orgId, opportunityId));
    if (!bookingId) {
        return { ok: false, error: "No active tour booking found for this record.", status: 400 };
    }

    try {
        const row =
            outcome === "completed"
                ? await markTourBookingCompleted(supabase, ctx.orgId, bookingId)
                : await markTourBookingNoShow(supabase, ctx.orgId, bookingId);
        return { ok: true, booking_id: row.id, outcome };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Record tour outcome failed.", status: 400 };
    }
}
