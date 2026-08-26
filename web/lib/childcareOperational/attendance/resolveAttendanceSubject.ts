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

import { listChildEnrollmentAgreements } from "@/lib/childcareOperational/enrollmentAgreementService";

export type AttendanceSubject = {
    customerMemberId: string;
    enrollmentAgreementId: string;
    siteLocationId: string | null;
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
    return {
        ok: true,
        subject: {
            customerMemberId: memberId,
            enrollmentAgreementId: String(agreement.id),
            siteLocationId: (agreement.site_location_id as string | null) ?? null,
        },
    };
}
