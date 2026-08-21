/**
 * WORK UNIT CONVERGENCE PLAN — which projections a canonical mutation event must refresh.
 *
 * The refresh POLICY already existed and was already unit-tested
 * (`lib/admin/opportunityQueueRefreshEvent.ts`). What was missing was a production consumer: the
 * three decision functions had zero callers, the current Work Unit route registered no listener, and
 * the guard that asserted otherwise read a route file deleted in a route move. So a placement change
 * converged KPIs and the record VM while the rows the operator was reading stayed stale.
 *
 * This module does not redesign the policy. It asks it, once, and returns the smallest set of
 * projections that must move. Deciding each projection INDEPENDENTLY is the point — "refresh
 * everything on any signal" is the failure mode a broadcast invites.
 *
 * ── WHY A SURFACE THAT CANNOT PATCH MUST REFETCH ──
 *
 * `shouldRefetchWorkUnitQueueRowsForEvent` deliberately returns false when the event carries a
 * display-only `queue_row_patch`, because a surface that can patch a visible row in place should not
 * pay for a lane refetch. The committed Work Unit surface composes its rows from the provisioning
 * answer and has no in-place row patcher, so honouring that "false" would leave the row stale — the
 * exact defect this module exists to close.
 *
 * Rather than special-casing the answer, we ask the policy the question this surface can actually
 * answer: with the patch STRIPPED. The existing policy then returns "refetch" for a visible
 * display-patch key on its own terms (`isQueueRowDisplayPatchActionKey && !hasPatchFields → true`),
 * and summaries follow the same branch. One policy, one vocabulary, no second opinion.
 */

import {
    isQueueRowDisplayPatchActionKey,
    shouldPatchWorkUnitQueueRowsForEvent,
    shouldRefetchWorkUnitQueueRowsForEvent,
    shouldRefreshQueueSummariesForEvent,
    type OpportunityQueueUpdatedDetail,
} from "@/lib/admin/opportunityQueueRefreshEvent";

export type WorkUnitConvergencePlan = {
    /** Re-prepare the provisioning answer so the committed rows are authoritative again. */
    refetchRows: boolean;
    /** Re-resolve Work View pill counts and the active lens's queue total. */
    refreshSummaries: boolean;
    /** The surface may patch the visible row in place instead of refetching. */
    patchRowsOnly: boolean;
};

const NO_CONVERGENCE: WorkUnitConvergencePlan = {
    refetchRows: false,
    refreshSummaries: false,
    patchRowsOnly: false,
};

/** Drop the display-only patch so the policy answers for a surface that cannot apply one. */
function withoutRowPatch(
    detail: OpportunityQueueUpdatedDetail | null,
): OpportunityQueueUpdatedDetail | null {
    if (!detail || detail.queue_row_patch === undefined) return detail;
    const { queue_row_patch: _dropped, ...rest } = detail;
    return rest;
}

export function planWorkUnitConvergence(args: {
    detail: OpportunityQueueUpdatedDetail | null;
    visibleOpportunityIds: readonly string[];
    /** True only when the caller can apply a display-only row patch without refetching. */
    canPatchRows?: boolean;
}): WorkUnitConvergencePlan {
    const { detail, visibleOpportunityIds, canPatchRows = false } = args;
    if (!detail) return NO_CONVERGENCE;

    const effective = canPatchRows ? detail : withoutRowPatch(detail);
    const policyArgs = { detail: effective, visibleOpportunityIds };

    const patchRowsOnly = canPatchRows && shouldPatchWorkUnitQueueRowsForEvent(policyArgs);
    if (patchRowsOnly) {
        // The policy's own answer: a patched visible row needs neither a lane refetch nor summaries.
        return { refetchRows: false, refreshSummaries: false, patchRowsOnly: true };
    }

    return {
        refetchRows: shouldRefetchWorkUnitQueueRowsForEvent(policyArgs),
        refreshSummaries: shouldRefreshQueueSummariesForEvent(policyArgs),
        patchRowsOnly: false,
    };
}

/** True when the action key is display-only — kept exported so callers can explain a decision. */
export function isDisplayOnlyWorkUnitActionKey(actionKey: string | null | undefined): boolean {
    return isQueueRowDisplayPatchActionKey(actionKey);
}
