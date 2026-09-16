import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * RESOLVE THE ATTENTION PARTICIPATION TO ITS AUTHORITATIVE MEMBER — scoped to one opportunity.
 *
 * ── WHY THIS EXISTS ──
 *
 * The settled drawer frame is composed for the FAMILY opportunity, so its truth carries no `child.*`
 * bindings. It was left re-DISCOVERING the child by matching `attention_subject_id` against
 * `truth._inquiry_children`. Those two values are in different id spaces: attention on a child lens
 * is `process_instances.id` (the participation), while the candidates are intake-metadata rows keyed
 * by inquiry-child id / `customer_member_id`. So the match returned `not_found` for EVERY child, not
 * merely a foreign one, `participantScope` settled null, and the Attendance and Health producers —
 * both keyed on `participantScope.customerMemberId` — returned `unavailable` for a child the commit
 * frame had already described. Measured on deployed staging: a `ready` card carrying "This child has
 * no active enrolment…" at 13,551 ms became "not available for this child" at 20,113 ms.
 *
 * The drawer route already DOCUMENTS this resolution as the authorization boundary — "handed to the
 * canonical participant resolver, which refuses a participation that does not belong to this record".
 * That intent was sound and simply unimplemented for this id space. This is that resolver.
 *
 * ── RESOLVED, NEVER TRUSTED ──
 *
 * The caller's participation id is an INPUT, not an answer. The row must be this org's and must hang
 * off THIS opportunity (`context_id`), so naming another family's participation resolves to null and
 * yields no child-scoped projection — the same refusal the route already promised. The member id is
 * read from `process_instances.subject_id`, which IS the participation's `customer_member_id` (the
 * child-grain queue reads exactly that column for exactly that purpose), so no second definition of
 * "which child" is introduced.
 *
 * ── WHY A READ IS UNAVOIDABLE HERE ──
 *
 * The settled composition holds no participation rows, and the only in-truth candidate set is intake
 * metadata whose `customer_member_id` is best-effort back-filled and frequently absent. Trusting a
 * client-supplied member id instead would delete the authorization boundary above. This is one
 * indexed lookup by primary key on the SETTLEMENT path — not the commit path — and it runs only when
 * a participation is actually named.
 */
export async function resolveParticipationSubjectForOpportunity(args: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    participationId: string | null;
}): Promise<{ participationId: string; customerMemberId: string } | null> {
    const participationId = args.participationId?.trim() ?? "";
    const opportunityId = args.opportunityId?.trim() ?? "";
    const orgId = args.orgId?.trim() ?? "";
    if (!participationId || !opportunityId || !orgId) return null;

    const { data, error } = await args.supabase
        .from("process_instances")
        .select("id, subject_type, subject_id, context_id")
        .eq("id", participationId)
        .eq("org_id", orgId)
        .eq("context_id", opportunityId)
        .maybeSingle();

    // A failed read is not a refusal, but it is not a scope either: answer null and let the caller's
    // existing fallback stand. Nothing here may invent a child.
    if (error || !data) return null;

    /*
     * Only a CHILD participation names the member this panel is about. `"child"` is the value the
     * canonical enrollment resolver filters on (`enrollmentContextResolver` queries
     * `process_instances` with `.eq("subject_type", "child")`), read from that owner rather than
     * assumed — the first draft of this guard tested `"customer_member"`, which would have rejected
     * every real row and reproduced the very silent-absence defect it exists to close.
     *
     * An unset value is not treated as a refusal: the org + opportunity + id triple above has already
     * authorized the row, and refusing on a blank column would fail closed against data this resolver
     * did not write.
     */
    const subjectType = String((data as { subject_type?: unknown }).subject_type ?? "").trim();
    if (subjectType && subjectType !== "child") return null;

    const customerMemberId = String((data as { subject_id?: unknown }).subject_id ?? "").trim();
    if (!customerMemberId) return null;

    return { participationId, customerMemberId };
}
