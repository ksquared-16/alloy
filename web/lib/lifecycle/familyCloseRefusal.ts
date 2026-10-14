/**
 * A FAMILY CASE CANNOT CLOSE OUT FROM UNDER ITS CHILDREN — ONE RULE FOR EVERY CLOSE PATH (E2E-09).
 *
 * The invariant used to be enforced in exactly one place, the `update_family_case_status` branch of
 * the outcome target executor. Other paths write the same "close this lead" meaning and did not
 * ask:
 *
 *   - the Mutation Runtime `update_lead_status` / `close_lead` commands (BOS, and Manage), which
 *     write `opportunities.status_key` through `execute_lead_status_mutation`;
 *   - the case grain of the enrollment-status transition ("Update Status" → Closed Lost), which
 *     writes through `updateOpportunityStatusWithEvent`;
 *   - the Action runtime's `update_status`, which writes through the same helper;
 *   - the legacy definition-driven executor (`executeAdminAction` — `update_status` and `open_form`
 *     with a status submit or `after.update_status_key`), which `POST /api/admin/actions/execute`
 *     falls back to for any key that is not a registered capability, and which writes
 *     `opportunities.status_key` directly from a tenant `action_definitions` row.
 *
 * Each could close a family whose waitlisted or enrolled child tracks were still live. The governed
 * family close (`executeGovernedFamilyClose`) closes those children FIRST, so it passes this rule on
 * the evidence; every other path now refuses with the same reasons.
 *
 * Only closes are asked. A write that leaves the case open costs nothing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    describeFamilyCloseBlock,
    evaluateFamilyCloseGuard,
    type FamilyCloseBlockedReason,
} from "@/lib/lifecycle/familyCloseGuard";
import { isConfiguredClosedStatus } from "@/lib/lifecycle/resolveOutcomeStatusOptions";
import { readEnrollmentInstancesForLead } from "@/lib/process/processInstances";

/**
 * Does this family case status close the case?
 *
 * Uses the SHARED closed-status predicate rather than a local `=== "closed"`, so the guard agrees
 * with Organization → Statuses and the Business Process editor by construction.
 *
 * Deliberately pure. An earlier version read the org's status catalog first, which was more
 * configurable in theory and wrong in practice: it pulled `createAdminClient` onto a code path
 * that outcome execution reaches with an injected client, and it charged every family status write
 * — including the `open` ones — an extra query to answer a question the canonical case domain
 * already settles. `opportunities.status_key` is `open | closed` by migration doctrine, which is
 * exactly the key-level resolution this predicate applies for the opportunity grain.
 */
export function familyCaseStatusCloses(statusKey: string): boolean {
    return isConfiguredClosedStatus({
        status_key: statusKey,
        status_label: statusKey,
        entity_type: "opportunities",
        is_active: true,
        metadata: null,
    });
}

export type FamilyCloseRefusal = {
    error: string;
    blocked_reasons: FamilyCloseBlockedReason[];
};

/**
 * Null when this status write may proceed: it does not close the case, or no child track is live.
 * Otherwise the refusal, with structured reasons a command surface can name. A failed read of the
 * children refuses — "could not read" is never "no children".
 */
export async function familyCloseRefusal(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        opportunityId: string;
        targetStatusKey: string;
        /**
         * The caller's action IS a close, whatever status string it writes. Case-grain "Lost /
         * Withdrawn" resolves `withdrawn`, legacy `mark_lost` writes `lost`, and `close_lead` lets
         * the operator pick any active status — each closes the case, and keying the refusal on the
         * status string alone let them through on a tenant where those keys are active (measured on
         * the certification tenant: case-grain Lost / Withdrawn wrote `withdrawn` over a waitlisted
         * child). The refusal follows the close INTENT; what each path writes is unchanged.
         */
        closesCase?: boolean;
    },
): Promise<FamilyCloseRefusal | null> {
    if (args.closesCase !== true && !familyCaseStatusCloses(args.targetStatusKey)) return null;
    const read = await readEnrollmentInstancesForLead(supabase, {
        orgId: args.orgId,
        opportunityId: args.opportunityId,
    });
    const decision = evaluateFamilyCloseGuard(read);
    if (decision.allowed) return null;
    return {
        error:
            "This lead cannot be closed while child enrollment tracks are still active ("
            + describeFamilyCloseBlock(decision)
            + ").",
        blocked_reasons: decision.reasons,
    };
}
