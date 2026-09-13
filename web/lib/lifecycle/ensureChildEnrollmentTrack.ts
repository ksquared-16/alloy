/**
 * THE CHILD TRACK BEGINS WHEN THE CHILD JOURNEY BEGINS.
 *
 * An Enrollment process carries stages of two grains. `lead`, `tour` and `decision` belong to the
 * FAMILY: they describe a household deciding, and a child riding along in them has no position of
 * their own to record. `waitlist`, `enrolling`, `enrolled` and the closed stages belong to the
 * CHILD, and from the moment a child stands in one, their process instance owns their stage.
 *
 * So the track is not created at intake. Creating one per child at Create Lead or Add Child would
 * fabricate a child journey for every enquiry a school ever receives — thousands of live journeys
 * for children whose families never got past a first phone call — and it would do it at the exact
 * moment the product has least to say about them. The boundary this module implements is the other
 * answer: the FIRST legitimate transition into a child-grain stage brings the track into existence,
 * and everything before that is honestly family-grain.
 *
 * ── WHY THIS IS NOT A SECOND CREATION MODEL ──
 *
 * `createEnrollmentProcessInstance` is the canonical bootstrap and stays it. This adds no insert of
 * its own: it resolves the child's existing track through the canonical scope resolver, and when
 * there is none it calls that bootstrap with the same anchor shape Start Enrollment uses — the
 * Enrollment Participation as context, the acquisition Opportunity recorded separately.
 *
 * `startEnrollment` is deliberately NOT reused, even though it wraps the same bootstrap. It does
 * three further things that are right for an operator pressing Start Enrollment and wrong for a
 * stage move: it stamps the participation `enrolling` (which would silently contradict a child
 * being moved to Waitlist), it resolves its own household context instead of honouring the
 * transition's, and it launches a participant packet — sending a family an access link as a side
 * effect of an internal status change nobody told them about. The shared part is the bootstrap, and
 * that is exactly the part this shares.
 *
 * ── NO FABRICATED STARTING STAGE ──
 *
 * The track is created with `stage_key: null`, and the caller's move writes the operator's actual
 * destination. Nothing is created "at Waitlist and then moved", and no intermediate child stage is
 * invented to satisfy a constructor — so the history reads as what happened: the track began, and
 * its first transition went where the operator sent it.
 *
 * ── IDEMPOTENT, INCLUDING AGAINST A CONCURRENT WRITER ──
 *
 * Two calls cannot produce two tracks. The resolve-then-create sequence handles the ordinary repeat,
 * and the race is settled below that by the database: `process_instances` carries a uniqueness
 * invariant on `(org_id, process_key, subject_id, context_id)` with a partial index for the
 * context-free shape, and `createEnrollmentProcessInstance` upserts against it and reports the
 * existing row as a reuse. No new schema is needed, and none is added.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    createEnrollmentProcessInstance,
    ENROLLMENT_PARTICIPATION_CONTEXT_TYPE,
    resolveEnrollmentInstanceIdForScope,
} from "@/lib/process/processInstances";
import { ensureOpportunityCustomerMemberParticipation } from "@/lib/lifecycle/ensureOpportunityCustomerMemberParticipation";

/** Stamped in provenance so a track born at a grain crossing is distinguishable from one Started. */
export const CHILD_TRACK_BOOTSTRAP_SOURCE = "child_stage_entry" as const;

export type EnsureChildEnrollmentTrackResult =
    | {
          ok: true;
          instanceId: string;
          /** False when an existing track was resolved and returned unchanged. */
          created: boolean;
      }
    | { ok: false; error: string };

/**
 * The child's Enrollment track, creating it only if this is genuinely their first child-grain
 * position.
 *
 * `ambiguous` is passed through as a refusal rather than resolved by picking one. Two live journeys
 * for one child is an integrity failure, and choosing between them here would write a stage onto
 * whichever happened to sort first while leaving the other looking equally current.
 */
export async function ensureChildEnrollmentTrack(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        /** The acquisition episode, when the child came through one. Null is legitimate. */
        opportunityId?: string | null;
        /** The durable child subject — `customer_members.id`. */
        customerMemberId: string;
        /** The Enrollment Participation, when the caller already holds it. */
        opportunityCustomerMemberId?: string | null;
    },
): Promise<EnsureChildEnrollmentTrackResult> {
    const orgId = args.orgId.trim();
    const customerMemberId = args.customerMemberId.trim();
    if (!orgId || !customerMemberId) {
        return { ok: false, error: "An organization and a child are required to begin a child track." };
    }
    const opportunityId = (args.opportunityId ?? "").trim() || null;

    const existing = await resolveEnrollmentInstanceIdForScope(supabase, {
        orgId,
        opportunityId,
        customerMemberId,
    });
    if (existing.ambiguous) {
        return {
            ok: false,
            error:
                "This child has more than one open enrollment journey, so there is no single track to "
                + "move. Resolve the duplicate before changing their stage.",
        };
    }
    if (existing.id) return { ok: true, instanceId: existing.id, created: false };

    /*
     * The participation is the journey's anchor, and it usually already exists — the caller reached
     * a child-grain transition through it. Find-or-create with NO `outcomeStatusKey`, so an existing
     * participation keeps the disposition it holds and a new one takes the ensurer's own default.
     * Naming a status here would make this module a second opinion about the child's disposition,
     * which the outcome's own status target owns.
     */
    let ocmId = (args.opportunityCustomerMemberId ?? "").trim() || null;
    if (!ocmId) {
        try {
            const participation = await ensureOpportunityCustomerMemberParticipation({
                supabase,
                orgId,
                opportunityId,
                customerMemberId,
                source: CHILD_TRACK_BOOTSTRAP_SOURCE,
            });
            ocmId = participation.ocmId;
        } catch (e) {
            return {
                ok: false,
                error: `Could not resolve this child's enrollment participation: ${
                    e instanceof Error ? e.message : String(e)
                }`,
            };
        }
    }

    const created = await createEnrollmentProcessInstance(supabase, {
        orgId,
        subjectId: customerMemberId,
        contextId: ocmId,
        contextType: ENROLLMENT_PARTICIPATION_CONTEXT_TYPE,
        // Where the family came from, kept distinct from what the journey anchors to.
        acquisitionOpportunityId: opportunityId,
        // No stage and no outcome: the caller's move writes the operator's real destination.
        stageKey: null,
        state: null,
        source: CHILD_TRACK_BOOTSTRAP_SOURCE,
    });
    if (created.error) return { ok: false, error: created.error };
    if (!created.id) {
        return { ok: false, error: "Could not begin this child's enrollment track." };
    }
    // `reused` means the bootstrap found the row rather than inserting it — a concurrent writer got
    // there first, which is success, not a collision.
    return { ok: true, instanceId: created.id, created: created.reused !== true };
}
