/**
 * Is this canonical member a valid subject for child Attendance?
 *
 * ── WHY THE QUESTION IS NOT "DOES THIS UUID EXIST" ──
 *
 * `customer_members` holds a household's members. A foreign key proves a row
 * exists; it does not prove the row is a CHILD. An external producer that maps
 * its identifier to an adult household member — a parent's door badge, a
 * guardian's staff record — would otherwise author an attendance fact asserting
 * that a child was present, in an append-only ledger, on the strength of an
 * adult's movement. That is not a mapping mistake to be corrected later; it is a
 * fabricated fact about a child.
 *
 * ── WHERE `relationship = 'child'` COMES FROM ──
 *
 * Not from a guess about vocabulary. `lib/records/childMemberAuthority.ts` is
 * the ONE authority that creates a household child member, and it owns
 * "the row's shape, `relationship: "child"`" — every child member in the system
 * is written with that value by that module. A dozen readers already gate on the
 * same predicate (`directEnrollService`, `startEnrollmentService`,
 * `childCohortQuery`, `findOrCreateChildPersonInOrg`, and others).
 *
 * `customer_member_relationship_types` configures the vocabulary of OTHER
 * household relationships per org; it is not a seam through which "child" itself
 * becomes tenant-defined. This module is the read-side counterpart of the write
 * authority, so the two say the same thing in one place each rather than in
 * fourteen places by coincidence.
 *
 * ── WHAT IT DELIBERATELY DOES NOT INFER ──
 *
 * Not from a name, not from a date of birth, not from the existence of an
 * enrolment, and never from anything a provider sent. Enrolment is a separate
 * question answered separately by `resolveAttendanceSubject`: a child with no
 * agreement is still a child, and an adult with an agreement is still an adult.
 *
 * `is_active` is also NOT consulted. An inactive membership is a lifecycle
 * state, not a statement that the person was never a child, and refusing on it
 * here would reject legitimate corrections to a departed child's history. The
 * enrolment check is where liveness belongs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** The canonical relationship value the one child-member write authority sets. */
export const CHILD_MEMBER_RELATIONSHIP = "child";

export type ChildMemberEligibility =
    | { ok: true; customerMemberId: string }
    | { ok: false; code: "member_not_found" | "member_not_a_child" | "member_unresolved"; message: string };

/**
 * Resolve whether a canonical member may be the subject of child Attendance.
 *
 * Fails CLOSED in every uncertain case, including an unreadable row: "we could
 * not check" must never become "it was fine".
 */
export async function resolveChildMemberEligibility(
    supabase: SupabaseClient,
    orgId: string,
    customerMemberId: string | null | undefined,
): Promise<ChildMemberEligibility> {
    const memberId = (customerMemberId ?? "").trim();
    if (!memberId) {
        return { ok: false, code: "member_not_found", message: "No canonical member was named." };
    }

    const { data, error } = await supabase
        .from("customer_members")
        .select("id, relationship")
        .eq("org_id", orgId)
        .eq("id", memberId)
        .maybeSingle();

    if (error) {
        return { ok: false, code: "member_unresolved", message: "The canonical member could not be read." };
    }
    if (!data) {
        // Includes the cross-tenant case: a member of another org is, from here,
        // a member that does not exist.
        return { ok: false, code: "member_not_found", message: "That canonical member does not exist in this organization." };
    }

    const row = data as { id: string; relationship: string | null };
    if (String(row.relationship ?? "").trim() !== CHILD_MEMBER_RELATIONSHIP) {
        return {
            ok: false,
            code: "member_not_a_child",
            message: "That canonical member is not a child, so attendance cannot be recorded for them.",
        };
    }

    return { ok: true, customerMemberId: row.id };
}
