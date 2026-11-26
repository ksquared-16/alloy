/**
 * Grain context extracted from queue row previews for drawer/action intent (Card 9).
 */

import type { QueueGrain } from "@/lib/config/queueDefinitionV2Runtime";
import type { QueuePreviewItemVm } from "@/lib/ui-v2/workspace-types";
import { readOpportunityIdFromQueueRow } from "@/lib/orchestration/placement/placementWaitlistCandidateRowProjection";

export type QueueRowGrainContext = {
    rowGrain?: QueueGrain;
    opportunityId?: string;
    placementCandidateId?: string;
    /** Child subject = customer_members.id. Threaded so movement targets the process instance directly. */
    customerMemberId?: string;
    opportunityCustomerMemberId?: string;
    childLifecycleStatus?: string | null;
};

function readString(raw: unknown): string | null {
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/** Parse grain metadata from a QueueService row preview record. */
export function parseQueueRowGrainContext(raw: Record<string, unknown>): QueueRowGrainContext {
    const rowGrainRaw = readString(raw.row_grain) ?? readString(raw.queue_grain);
    const rowGrain =
        rowGrainRaw === "case" || rowGrainRaw === "child" || rowGrainRaw === "candidate"
            ? rowGrainRaw
            : undefined;

    const waitlistProj = raw._placement_waitlist_row;
    let placementCandidateId = readString(raw.placement_candidate_id);
    if (!placementCandidateId && waitlistProj != null && typeof waitlistProj === "object" && !Array.isArray(waitlistProj)) {
        placementCandidateId = readString((waitlistProj as Record<string, unknown>).placement_candidate_id);
    }

    let opportunityCustomerMemberId = readString(raw.opportunity_customer_member_id);
    const childGrainProj = raw._child_lifecycle_grain_row;
    if (
        !opportunityCustomerMemberId &&
        childGrainProj != null &&
        typeof childGrainProj === "object" &&
        !Array.isArray(childGrainProj)
    ) {
        opportunityCustomerMemberId = readString(
            (childGrainProj as Record<string, unknown>).opportunity_customer_member_id
        );
    }

    // Child subject id (process_instances.subject_id) — the identity movement targets directly.
    let customerMemberId = readString(raw.customer_member_id);
    if (
        !customerMemberId &&
        childGrainProj != null &&
        typeof childGrainProj === "object" &&
        !Array.isArray(childGrainProj)
    ) {
        customerMemberId = readString((childGrainProj as Record<string, unknown>).customer_member_id);
    }

    const childLifecycleStatus =
        readString(raw.child_lifecycle_status) ??
        (childGrainProj != null && typeof childGrainProj === "object" && !Array.isArray(childGrainProj)
            ? readString((childGrainProj as Record<string, unknown>).child_lifecycle_status)
            : null);

    return {
        rowGrain,
        opportunityId: readOpportunityIdFromQueueRow(raw) || undefined,
        placementCandidateId: placementCandidateId ?? undefined,
        customerMemberId: customerMemberId ?? undefined,
        opportunityCustomerMemberId: opportunityCustomerMemberId ?? undefined,
        childLifecycleStatus,
    };
}

export function queueRowGrainContextFromPreviewItem(item: QueuePreviewItemVm): QueueRowGrainContext {
    const waitlist = item.placementWaitlistCandidate;
    const rowGrain =
        waitlist != null
            ? ("candidate" as const)
            : item.rowGrain === "case" || item.rowGrain === "child" || item.rowGrain === "candidate"
              ? item.rowGrain
              : undefined;

    return {
        rowGrain,
        opportunityId: item.opportunityId?.trim() || undefined,
        placementCandidateId: waitlist?.placementCandidateId ?? item.placementCandidateId,
        customerMemberId: item.customerMemberId ?? undefined,
        opportunityCustomerMemberId: item.opportunityCustomerMemberId,
        childLifecycleStatus: item.childLifecycleStatus ?? null,
    };
}

export function queueRowGrainActionPayload(ctx: QueueRowGrainContext): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (ctx.rowGrain) out.row_grain = ctx.rowGrain;
    if (ctx.opportunityId) out.opportunity_id = ctx.opportunityId;
    if (ctx.placementCandidateId) out.placement_candidate_id = ctx.placementCandidateId;
    if (ctx.customerMemberId) out.customer_member_id = ctx.customerMemberId;
    if (ctx.opportunityCustomerMemberId) out.opportunity_customer_member_id = ctx.opportunityCustomerMemberId;
    if (ctx.childLifecycleStatus) out.child_lifecycle_status = ctx.childLifecycleStatus;
    return out;
}
