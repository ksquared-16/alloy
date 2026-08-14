/**
 * Inbound SMS "Reply 1" → Tour attendance confirmation.
 *
 * Context-scoped: only when the thread has an eligible Tour reminder outbound
 * (metadata.event_key=tour_reminder + tour_booking_id) for an active booking.
 * Arbitrary "1" in unrelated threads does nothing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { confirmTourAttendance } from "@/lib/tours/bookings/confirmTourAttendance";
import { TOUR_COMMS_OUTBOUND_METADATA, TOUR_COMMS_OUTBOUND_SOURCE } from "@/lib/tours/comms/tourCommsConfig";
import { resolveTourCommsConfigWithLibrary } from "@/lib/tours/comms/resolveTourCommsConfigWithLibrary";

export function normalizeTourAttendanceSmsReply(body: string | null | undefined): "1" | null {
    const t = String(body ?? "").trim().toLowerCase();
    if (!t) return null;
    // Strip punctuation / "reply 1" wrappers — do not treat YES/STOP as attendance.
    const compact = t.replace(/[.!?,]/g, "").replace(/\s+/g, " ");
    if (compact === "1") return "1";
    if (compact === "reply 1") return "1";
    return null;
}

export async function tryConfirmTourAttendanceFromSmsReply(params: {
    supabase: SupabaseClient;
    orgId: string;
    threadId: string | null | undefined;
    personId: string | null | undefined;
    body: string | null | undefined;
}): Promise<{ applied: boolean; reason: string; bookingId?: string }> {
    if (!normalizeTourAttendanceSmsReply(params.body)) {
        return { applied: false, reason: "not_attendance_reply" };
    }
    const threadId = String(params.threadId ?? "").trim();
    const personId = String(params.personId ?? "").trim();
    if (!threadId || !personId) {
        return { applied: false, reason: "missing_thread_or_person" };
    }

    // Eligible context: recent outbound Tour reminder on this thread.
    const { data: rows, error } = await params.supabase
        .from("communication_messages")
        .select("id, metadata, created_at")
        .eq("org_id", params.orgId)
        .eq("thread_id", threadId)
        .eq("direction", "outbound")
        .order("created_at", { ascending: false })
        .limit(20);
    if (error) {
        return { applied: false, reason: `lookup_failed:${error.message}` };
    }

    let bookingId = "";
    for (const row of rows ?? []) {
        const meta = (row as { metadata?: Record<string, unknown> }).metadata ?? {};
        const source = String(meta[TOUR_COMMS_OUTBOUND_METADATA.source] ?? meta.source ?? "").trim();
        const eventKey = String(meta[TOUR_COMMS_OUTBOUND_METADATA.eventKey] ?? meta.event_key ?? "").trim();
        const bid = String(meta[TOUR_COMMS_OUTBOUND_METADATA.tourBookingId] ?? meta.tour_booking_id ?? "").trim();
        if (source === TOUR_COMMS_OUTBOUND_SOURCE && eventKey === "tour_reminder" && bid) {
            bookingId = bid;
            break;
        }
        // Scheduled-send fan-out may only carry tour_booking_id + reminder_key.
        if (bid && String(meta.reminder_key ?? "").startsWith("tour_reminder")) {
            bookingId = bid;
            break;
        }
    }
    if (!bookingId) {
        return { applied: false, reason: "no_eligible_tour_reminder_context" };
    }

    const { data: booking } = await params.supabase
        .from("tour_bookings")
        .select("id, location_id, status_key")
        .eq("org_id", params.orgId)
        .eq("id", bookingId)
        .maybeSingle();
    if (!booking) return { applied: false, reason: "booking_not_found" };
    const status = String((booking as { status_key?: string }).status_key ?? "");
    if (!["confirmed", "rescheduled", "pending_approval"].includes(status)) {
        return { applied: false, reason: "booking_not_active" };
    }

    const { config } = await resolveTourCommsConfigWithLibrary(params.supabase, {
        orgId: params.orgId,
        locationId: (booking as { location_id?: string | null }).location_id ?? null,
    });
    if (!config.ask_parent_confirm_attendance) {
        return { applied: false, reason: "confirm_attendance_disabled" };
    }

    const result = await confirmTourAttendance(params.supabase, {
        orgId: params.orgId,
        bookingId,
        confirmedByPersonId: personId,
        source: "sms_reply",
    });
    return {
        applied: true,
        reason: result.alreadyConfirmed ? "already_confirmed" : "confirmed",
        bookingId,
    };
}
