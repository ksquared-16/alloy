/**
 * WHO RECEIVES A CHILD'S ENROLLMENT PAPERWORK.
 *
 * Not "the first email on the record". The platform already owns who is related to a child and in
 * what order — `person_child_relationships` carries `priority`, which is what "#1" means, and
 * `person_child_relationship_roles` carries the roles, many per relationship. `resolveChildParties`
 * reads exactly that graph, so this module chooses among canonical parties rather than discovering
 * contacts of its own.
 *
 * The tour precedent resolves its recipient from the OPPORTUNITY's primary person, which is right
 * for a family-grain invitation and wrong here: enrollment paperwork is about ONE child, and the
 * adult who should receive it is the adult related to that child — which may not be the adult who
 * happened to submit the original inquiry.
 *
 * ── THE ORDER, AND WHY IT IS THE ORDER ──
 *
 *   1. a caregiving role (parent / guardian / primary contact), because paperwork asks for consent
 *      and authority, and an emergency contact or authorized pickup holds neither;
 *   2. then the relationship's own `priority`;
 *   3. then, only among equals, a stable tiebreak so repeated prepares choose the same person.
 *
 * Deliverability is a FILTER, never the ordering. Choosing "whoever has an email" would let a
 * grandmother listed as an emergency contact outrank a guardian whose email is simply missing — and
 * the second case is a record to fix, which the blocker says out loud.
 *
 * No recipient is an ACTIONABLE BLOCKER, never a fallback to handing the operator a URL to send
 * themselves. A link pasted by hand is delivery with no audit, no thread and no record that the
 * family was ever contacted.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveChildParties, type ChildParty } from "@/lib/enrollment/participantRuntime/childPartyRuntime";

/** Roles that carry caregiving authority. The vocabulary is `customer_person_role_types`. */
const CAREGIVING_ROLE_KEYS = new Set(["parent", "guardian", "primary_contact"]);

export type EnrollmentPaperworkRecipient = {
    personId: string;
    displayName: string | null;
    email: string | null;
    phone: string | null;
    /** Every deliverable party, so a composer can offer the operator the alternatives. */
    alternatives: Array<{ personId: string; displayName: string | null }>;
};

export type EnrollmentPaperworkRecipientResult =
    | { ok: true; recipient: EnrollmentPaperworkRecipient }
    | { ok: false; code: "missing_recipient"; message: string };

const deliverable = (p: ChildParty) => Boolean(p.email?.trim() || p.phone?.trim());
const caregiving = (p: ChildParty) => p.roles.some((r) => CAREGIVING_ROLE_KEYS.has(r));

/** Caregiving first, then the relationship's own priority, then a stable tiebreak. */
export function orderEnrollmentPaperworkCandidates(parties: readonly ChildParty[]): ChildParty[] {
    return [...parties].sort((a, b) => {
        const care = Number(caregiving(b)) - Number(caregiving(a));
        if (care !== 0) return care;
        if (a.priority !== b.priority) return a.priority - b.priority;
        // Repeated prepares must choose the same person; `person_id` is stable where nothing else is.
        return a.person_id.localeCompare(b.person_id);
    });
}

export async function resolveEnrollmentPaperworkRecipient(
    supabase: SupabaseClient,
    input: { orgId: string; customerMemberId: string; childLabel?: string | null },
): Promise<EnrollmentPaperworkRecipientResult> {
    const parties = await resolveChildParties(supabase, {
        orgId: input.orgId,
        customerMemberId: input.customerMemberId,
    });
    const who = input.childLabel?.trim() || "this child";

    if (parties.length === 0) {
        return {
            ok: false,
            code: "missing_recipient",
            message:
                `No parent or guardian is linked to ${who}, so there is nobody to send enrollment `
                + `paperwork to. Add the family contact on the child's record, then send again.`,
        };
    }

    const ordered = orderEnrollmentPaperworkCandidates(parties);
    const reachable = ordered.filter(deliverable);
    if (reachable.length === 0) {
        return {
            ok: false,
            code: "missing_recipient",
            message:
                `${ordered[0]?.full_name?.trim() || "The family contact"} has no email address or mobile `
                + `number on file, so enrollment paperwork cannot be delivered. Add one, then send again.`,
        };
    }

    const chosen = reachable[0]!;
    return {
        ok: true,
        recipient: {
            personId: chosen.person_id,
            displayName: chosen.full_name?.trim() || null,
            email: chosen.email,
            phone: chosen.phone,
            alternatives: reachable.map((p) => ({
                personId: p.person_id,
                displayName: p.full_name?.trim() || null,
            })),
        },
    };
}
