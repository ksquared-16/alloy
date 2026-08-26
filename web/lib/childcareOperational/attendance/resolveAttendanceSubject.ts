/**
 * CHILD → ATTENDANCE SUBJECT.
 *
 * An operator acts on a CHILD. The Attendance domain requires an `enrollmentAgreementId`, and that
 * requirement is correct: attendance is a fact about a child's enrolment, not about a name. This is
 * the one place the two are joined, so the invariant is preserved without the card or the operator
 * ever handling an agreement id.
 *
 * ── IT FAILS CLOSED ──
 *
 * No agreement, several ambiguous agreements, or a cancelled one all return a REFUSAL rather than a
 * guess. Attendance recorded against the wrong agreement is worse than attendance not recorded: it
 * lands on a real enrolment, silently, and the operator has no way to see that it went to the wrong
 * one.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { effectiveAttendanceEvents } from "@/lib/childcareOperational/attendance/attendanceFold";
import { listAttendanceEvents } from "@/lib/childcareOperational/attendance/attendanceService";
import { getOperationalPlacementForAgreement } from "@/lib/childcareOperational/childPlacementService";
import { listChildEnrollmentAgreements } from "@/lib/childcareOperational/enrollmentAgreementService";

export type AttendanceSubject = {
    customerMemberId: string;
    enrollmentAgreementId: string;
    siteLocationId: string | null;
    /**
     * The room the child's CANONICAL PLACEMENT puts them in.
     *
     * `check_in` requires a room, and the placement is the authority on which one — not whatever
     * room a card happened to be showing. Reading it here keeps "where is this child supposed to
     * be" a property of the enrolment rather than of the UI that opened.
     */
    placementRoomLocationId: string | null;
};

export type ResolveAttendanceSubjectResult =
    | { ok: true; subject: AttendanceSubject }
    | { ok: false; code: "missing_child" | "no_agreement" | "ambiguous_agreement"; message: string };

/** Statuses that can carry attendance. A cancelled agreement is refused by the domain anyway. */
const ATTENDABLE = new Set(["active", "pending_start", "ending"]);

export async function resolveAttendanceSubject(
    supabase: SupabaseClient,
    orgId: string,
    customerMemberId: string | null | undefined,
): Promise<ResolveAttendanceSubjectResult> {
    const memberId = (customerMemberId ?? "").trim();
    if (!memberId) {
        return { ok: false, code: "missing_child", message: "A child is required to record attendance." };
    }

    const agreements = await listChildEnrollmentAgreements(supabase, orgId, {
        customerMemberId: memberId,
    });
    const attendable = agreements.filter((a) => ATTENDABLE.has(String(a.status ?? "").trim()));

    if (attendable.length === 0) {
        return {
            ok: false,
            code: "no_agreement",
            message: "This child has no active enrolment, so attendance cannot be recorded for them.",
        };
    }
    if (attendable.length > 1) {
        // Two live enrolments — genuinely ambiguous. Picking the newest would be a guess that lands
        // real attendance on a real agreement the operator did not choose.
        return {
            ok: false,
            code: "ambiguous_agreement",
            message: "This child has more than one active enrolment; attendance cannot choose between them.",
        };
    }

    const agreement = attendable[0]!;
    const placement = await getOperationalPlacementForAgreement(
        supabase,
        orgId,
        String(agreement.id),
    ).catch(() => null);

    return {
        ok: true,
        subject: {
            customerMemberId: memberId,
            enrollmentAgreementId: String(agreement.id),
            siteLocationId: (agreement.site_location_id as string | null) ?? null,
            placementRoomLocationId:
                ((placement as { room_location_id?: string | null } | null)?.room_location_id ?? null),
        },
    };
}

/**
 * THE CHILD'S CURRENT ROOM, decided by the attendance fold.
 *
 * A transfer needs a source, and the source is where the child ACTUALLY is — the last effective
 * room-bearing event of the day — not a room a card was displaying. Letting the client name the
 * source would let a stale screen rewrite where a child was.
 *
 * Falls back to the placement room: before any event today, the placement is genuinely where they
 * are meant to be. Null when neither knows, and the caller must then refuse rather than invent one.
 */
export async function resolveCurrentRoom(
    supabase: SupabaseClient,
    orgId: string,
    subject: AttendanceSubject,
    serviceDate: string,
): Promise<string | null> {
    const events = await listAttendanceEvents(supabase, orgId, {
        enrollmentAgreementId: subject.enrollmentAgreementId,
        serviceDateStart: serviceDate,
        serviceDateEnd: serviceDate,
    }).catch(() => []);

    // Corrections and reversals are honoured by the fold, so a corrected transfer moves the child
    // back rather than leaving the superseded room standing.
    const effective = effectiveAttendanceEvents(events as never);
    for (let i = effective.length - 1; i >= 0; i -= 1) {
        const e = effective[i] as unknown as Record<string, unknown>;
        const to = (e.to_room_location_id as string | null) ?? null;
        const room = (e.room_location_id as string | null) ?? null;
        if (to) return to;
        if (room) return room;
    }
    return subject.placementRoomLocationId;
}
