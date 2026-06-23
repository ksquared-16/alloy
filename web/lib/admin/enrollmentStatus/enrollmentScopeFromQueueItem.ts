/**
 * Extract enrollment status scope hints from queue row payloads.
 */

import type { QueueRowGrainContext } from "@/lib/queues/queueRowGrainContext";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";
import { queueRowGrainContextFromPreviewItem } from "@/lib/queues/queueRowGrainContext";
import type { EnrollmentStatusTransitionScope } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";

export function enrollmentScopeFromQueueGrainContext(
    opportunityId: string,
    ctx: QueueRowGrainContext,
): Partial<EnrollmentStatusTransitionScope> {
    const oid = ctx.opportunityId?.trim() || opportunityId.trim();
    if (ctx.opportunityCustomerMemberId) {
        return {
            grain: ctx.rowGrain === "candidate" ? "candidate" : "child",
            opportunityId: oid,
            opportunityCustomerMemberId: ctx.opportunityCustomerMemberId,
            placementCandidateId: ctx.placementCandidateId ?? null,
        };
    }
    if (ctx.rowGrain === "candidate" && ctx.placementCandidateId) {
        return {
            grain: "candidate",
            opportunityId: oid,
            placementCandidateId: ctx.placementCandidateId,
        };
    }
    return {
        grain: ctx.rowGrain ?? "case",
        opportunityId: oid,
    };
}

export function enrollmentScopeFromQueuePreviewItem(
    item: QueuePreviewItemVm | null | undefined,
    fallbackOpportunityId: string,
): Partial<EnrollmentStatusTransitionScope> {
    if (!item) return { opportunityId: fallbackOpportunityId.trim(), grain: "case" };
    const grainCtx = queueRowGrainContextFromPreviewItem(item);
    return enrollmentScopeFromQueueGrainContext(
        grainCtx.opportunityId ?? fallbackOpportunityId,
        grainCtx,
    );
}
