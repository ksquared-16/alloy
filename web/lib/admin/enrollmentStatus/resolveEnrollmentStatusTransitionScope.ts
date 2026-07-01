/**
 * Resolve enrollment status transition target scope from runtime surfaces.
 */

import type { ContextualActionInvocation } from "@/lib/admin/actions/contextualActionInvocation";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";
import type {
    EnrollmentStatusTransitionGrain,
    EnrollmentStatusTransitionScope,
    EnrollmentStatusTransitionSourceSurface,
} from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";

function trimId(raw: unknown): string | null {
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export type ResolveEnrollmentScopeInput = {
    opportunityId: string;
    sourceSurface: EnrollmentStatusTransitionSourceSurface;
    /** Explicit prefill from caller. */
    opportunityCustomerMemberId?: string | null;
    placementCandidateId?: string | null;
    rowGrain?: EnrollmentStatusTransitionGrain | null;
    childDisplayName?: string | null;
    /** Queue row context when invoked from work unit queue. */
    queueRowContext?: QueueRowContext | null;
    /** Raw queue row record fallback. */
    queueRow?: Record<string, unknown> | null;
    invocation?: ContextualActionInvocation | null;
};

export function resolveEnrollmentStatusScopeFromQueueRowContext(
    opportunityId: string,
    context: QueueRowContext | null | undefined,
): EnrollmentStatusTransitionScope | null {
    if (!context?.row_subject) return null;
    const subjectType = context.row_subject.subject_type;
    const subjectId = trimId(context.row_subject.subject_id);
    if (!subjectId) return null;

    if (subjectType === "child") {
        return {
            grain: "child",
            opportunityId,
            opportunityCustomerMemberId: subjectId,
            childDisplayName: trimId(context.row_subject.display_name),
        };
    }
    if (subjectType === "candidate") {
        return {
            grain: "candidate",
            opportunityId,
            placementCandidateId: subjectId,
            childDisplayName: trimId(context.row_subject.display_name),
        };
    }
    return {
        grain: "case",
        opportunityId,
    };
}

export function resolveEnrollmentStatusTransitionScope(
    input: ResolveEnrollmentScopeInput,
): EnrollmentStatusTransitionScope {
    const opportunityId = input.opportunityId.trim();
    const explicitOcm = trimId(input.opportunityCustomerMemberId);
    const explicitPc = trimId(input.placementCandidateId);
    const explicitGrain = input.rowGrain ?? null;

    if (explicitOcm) {
        return {
            grain: explicitGrain === "candidate" ? "candidate" : "child",
            opportunityId,
            opportunityCustomerMemberId: explicitOcm,
            placementCandidateId: explicitPc,
            childDisplayName: trimId(input.childDisplayName),
        };
    }

    if (input.queueRowContext) {
        const fromContext = resolveEnrollmentStatusScopeFromQueueRowContext(opportunityId, input.queueRowContext);
        if (fromContext) return fromContext;
    }

    const row = input.queueRow;
    if (row) {
        const ctx = row._queue_row_context as QueueRowContext | undefined;
        if (ctx) {
            const fromContext = resolveEnrollmentStatusScopeFromQueueRowContext(opportunityId, ctx);
            if (fromContext) return fromContext;
        }
        const ocmId =
            trimId(row.opportunity_customer_member_id) ??
            trimId((row._ocm_enrollment_track_row as Record<string, unknown> | undefined)?.opportunity_customer_member_id);
        if (ocmId) {
            return {
                grain: "child",
                opportunityId,
                opportunityCustomerMemberId: ocmId,
                childDisplayName: trimId(row._child_display_name),
            };
        }
    }

    return {
        grain: explicitGrain ?? "case",
        opportunityId,
        placementCandidateId: explicitPc,
    };
}

export function mapRegistrySurfaceToEnrollmentSource(surface: string): EnrollmentStatusTransitionSourceSurface {
    const s = surface.trim();
    if (s === "queue_row") return "queue_row";
    if (s === "record_section") return "layout_button";
    if (s === "record_header") return "opportunity_drawer";
    return "opportunity_drawer";
}
