/**
 * ONE MEMBERSHIP PROJECTION FOR A CHILD LENS — rows AND counts.
 *
 * THE DEFECT THIS EXISTS TO REMOVE. "All Children in Enrollment" rendered thirteen child rows under a
 * pill that said eight. Both numbers were computed honestly; they were answers to different questions.
 * The rows came from the child provider (live enrollment participations). The count came from
 * `aggregateWorkViewTotals`, which counts the OPPORTUNITY base lane — and because a stage-independent
 * lens has no predicates, `isWorkViewCatchAll` treated it as include-all and handed back the lane's
 * exact all-records total: eight family cases. The count path never asked the lens what its rows ARE.
 *
 * A count that disagrees with the rows beneath it is worse than a missing count: it is the surface
 * telling an operator two different things at once and giving no way to tell which is true.
 *
 * So membership is defined ONCE, here, and both the rows and the count are derived from it. Not a
 * count patched to match the rows — the same projection, read twice. They cannot drift, because there
 * is nothing to drift between.
 *
 * WHAT IS NOT RE-DECIDED HERE. Nothing. `lensStageKeys` still reads the lens, the provider still owns
 * the query, and the Enrollment Definition's `isLiveEnrollmentParticipant` is still the only liveness
 * authority (via `queryEnrollmentProcessInstanceParticipationRows`). This module only names the rule
 * that was previously written inline in the provisioning answer, so a second caller can obey it
 * instead of inventing its own.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";
import {
    loadChildGrainProvisioningRows,
    type ChildProvisioningRow,
    type ChildRowMembership,
} from "@/lib/runtime/provisioning/childGrainProvisioningRows";
// From its own module, NOT from the provisioning answer — importing the answer here would make a cycle
// out of a one-way dependency (the answer consumes this).
import { lensStageKeys } from "@/lib/lifecycle/lensStageKeys";

/**
 * WHICH CHILDREN THIS LENS CONTAINS — the one derivation.
 *
 * A stage-scoped child lens (Registration, Waitlist) means "children at these stages". A
 * stage-INDEPENDENT one means "children whose enrollment journey is still running", which is a
 * different question and not the first one run over every stage: enumerating stages would admit a
 * child whose own participation is closed while the family case still sits in an active stage.
 */
export function childRowMembershipForLens(view: WorkViewConfigV1Stored): ChildRowMembership {
    const stageKeys = lensStageKeys(view);
    return stageKeys.length ? { mode: "stages", stageKeys } : { mode: "participation" };
}

/**
 * The lens's child members. The provisioning answer publishes these as rows; the totals route counts
 * them. Same call, same rule, same liveness gate — so `rows.length === pill count` by construction
 * rather than by agreement.
 *
 * THROWS on read failure, exactly as the provider does. A caller that cannot read must say so (the
 * answer refuses with `records_unavailable`; the totals route reports the count as UNKNOWN). Neither
 * may degrade to a family number — a family count under child rows is the very defect above.
 */
export async function loadChildGrainMembersForLens(params: {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string;
    view: WorkViewConfigV1Stored;
}): Promise<ChildProvisioningRow[]> {
    return loadChildGrainProvisioningRows({
        supabase: params.supabase,
        orgId: params.orgId,
        workUnitId: params.workUnitId,
        membership: childRowMembershipForLens(params.view),
    });
}

/**
 * The lens's child member COUNT.
 *
 * Deliberately counts the projected members rather than issuing a cheaper `count(*)`. A separate
 * counting query would be a second definition of membership — the exact thing that produced 13-vs-8 —
 * and the liveness gate is a predicate over the composed participant, not a WHERE clause that could be
 * pushed into SQL without restating it. Correctness here is worth more than a round trip, and the
 * result is bounded by the same work-unit scope the rows already are.
 *
 * This does NOT touch the enrichment-independent count doctrine: that invariant governs the
 * OPPORTUNITY `count_only` path (no `activity_timeline_events`, no presentation batch fetches), which
 * this path does not enter at all.
 */
export async function countChildGrainMembersForLens(params: {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string;
    view: WorkViewConfigV1Stored;
}): Promise<number> {
    const rows = await loadChildGrainMembersForLens(params);
    return rows.length;
}
