/**
 * Confirm parent attendance for a scheduled Tour.
 *
 * This does NOT change booking `status_key`. A Tour remains confirmed even when
 * the parent never responds — attendance is operational affirmation only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { TourBookingRow } from "@/lib/tours/bookings/types";
import {
    readAttendanceConfirmation,
    withAttendanceConfirmation,
} from "@/lib/tours/bookings/tourBookingAttendance";
import { emitTourBookingLifecycleEvent } from "@/lib/tours/events/tourLifecycleEvents";

export type ConfirmTourAttendanceInput = {
    orgId: string;
    bookingId: string;
    confirmedByPersonId?: string | null;
    source: "email_action" | "sms_reply" | "operator";
    actionLinkId?: string | null;
    correlationId?: string | null;
    actorUserId?: string | null;
};

export type ConfirmTourAttendanceResult = {
    booking: TourBookingRow;
    alreadyConfirmed: boolean;
};

const ACTIVE = new Set(["confirmed", "rescheduled", "pending_approval"]);

export async function confirmTourAttendance(
    supabase: SupabaseClient,
    input: ConfirmTourAttendanceInput,
): Promise<ConfirmTourAttendanceResult> {
    const orgId = String(input.orgId).trim();
    const bookingId = String(input.bookingId).trim();

    const { data, error } = await supabase
        .from("tour_bookings")
        .select("*")
        .eq("org_id", orgId)
        .eq("id", bookingId)
        .maybeSingle();
    if (error) throw new Error(`tour_bookings fetch: ${error.message}`);
    if (!data) throw new Error("tour_bookings: not found");

    const booking = data as TourBookingRow;
    if (!ACTIVE.has(booking.status_key)) {
        throw new Error("tour_bookings: attendance confirmation not allowed for this status");
    }

    const existing = readAttendanceConfirmation(booking.metadata);
    if (existing?.status === "confirmed_by_parent") {
        return { booking, alreadyConfirmed: true };
    }

    const now = new Date().toISOString();
    const metadata = withAttendanceConfirmation(booking.metadata, {
        status: "confirmed_by_parent",
        confirmed_at: now,
        confirmed_by_person_id: input.confirmedByPersonId ?? booking.primary_person_id ?? null,
        source: input.source,
        action_link_id: input.actionLinkId ?? null,
    });

    const { data: updated, error: uErr } = await supabase
        .from("tour_bookings")
        .update({ metadata, updated_at: now })
        .eq("org_id", orgId)
        .eq("id", bookingId)
        .select("*")
        .single();
    if (uErr) throw new Error(`tour_bookings attendance update: ${uErr.message}`);

    const row = updated as TourBookingRow;

    // Lifecycle-adjacent fact for Activity — does not change booking status_key.
    await emitTourBookingLifecycleEvent(supabase, "tour_attendance_confirmed", row, {
        previous_status_key: booking.status_key,
        previous_start_at: booking.start_at,
        previous_end_at: booking.end_at,
        attendance_source: input.source,
        confirmed_by_person_id: input.confirmedByPersonId ?? booking.primary_person_id ?? null,
    }, {
        correlation_id: input.correlationId ?? null,
        actor_user_id: input.actorUserId ?? null,
    });

    return { booking: row, alreadyConfirmed: false };
}
