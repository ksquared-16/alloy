/**
 * Workflow events for childcare operational enrollment handoff and lifecycle.
 */

import { emitEvent } from "@/lib/emitEvent";

export const OPERATIONAL_ENROLLMENT_EVENT_SCHEMA_VERSION = 1;

export const ENROLLMENT_AGREEMENT_CREATED_EVENT = "enrollment_agreement_created";
export const PLACEMENT_CREATED_EVENT = "placement_created";
export const SCHEDULE_ASSIGNMENT_CREATED_EVENT = "schedule_assignment_created";
export const OPERATIONAL_ENROLLMENT_HANDOFF_COMPLETED_EVENT =
    "operational_enrollment_handoff_completed";
export const OPERATIONAL_ENROLLMENT_HANDOFF_PARTIAL_EVENT =
    "operational_enrollment_handoff_partial";

export const PLACEMENT_CHANGED_EVENT = "placement_changed";
export const SCHEDULE_ASSIGNMENT_CHANGED_EVENT = "schedule_assignment_changed";
export const AGREEMENT_ENDING_SCHEDULED_EVENT = "agreement_ending_scheduled";
export const AGREEMENT_ENDED_EVENT = "agreement_ended";
export const AGREEMENT_CANCELED_EVENT = "agreement_canceled";

export const OPERATOR_ENROLLMENT_EDIT_ACTION = "operator_enrollment_edit";
export const HANDOFF_SOURCE_KEY = "approve_enrollment_handoff";

export const ENROLLMENT_AGREEMENT_ENTITY_TYPE = "child_enrollment_agreements";
export const CHILD_PLACEMENT_ENTITY_TYPE = "child_placements";
export const SCHEDULE_ASSIGNMENT_ENTITY_TYPE = "schedule_assignments";
export const OPPORTUNITY_ENTITY_TYPE = "opportunities";

type EmitContext = {
    actorUserId?: string | null;
    correlationId?: string | null;
};

function compactPayload(
    base: Record<string, unknown>,
    ctx?: EmitContext
): Record<string, unknown> {
    return {
        schema_version: OPERATIONAL_ENROLLMENT_EVENT_SCHEMA_VERSION,
        ...base,
        ...(ctx?.actorUserId ? { actor_user_id: ctx.actorUserId } : {}),
        ...(ctx?.correlationId ? { correlation_id: ctx.correlationId } : {}),
    };
}

export async function emitEnrollmentAgreementCreatedEvent(input: {
    orgId: string;
    agreementId: string;
    opportunityId: string | null;
    customerMemberId: string;
    siteLocationId: string;
    sourceKey: string;
    ctx?: EmitContext;
}): Promise<string> {
    return emitEvent({
        org_id: input.orgId,
        event_type: ENROLLMENT_AGREEMENT_CREATED_EVENT,
        entity_type: ENROLLMENT_AGREEMENT_ENTITY_TYPE,
        entity_id: input.agreementId,
        action_type: "approve_enrollment_handoff",
        payload: compactPayload(
            {
                agreement_id: input.agreementId,
                opportunity_id: input.opportunityId,
                customer_member_id: input.customerMemberId,
                site_location_id: input.siteLocationId,
                source_key: input.sourceKey,
            },
            input.ctx
        ),
    });
}

export async function emitPlacementCreatedEvent(input: {
    orgId: string;
    placementId: string;
    enrollmentAgreementId: string;
    customerMemberId: string;
    siteLocationId: string;
    ctx?: EmitContext;
}): Promise<string> {
    return emitEvent({
        org_id: input.orgId,
        event_type: PLACEMENT_CREATED_EVENT,
        entity_type: CHILD_PLACEMENT_ENTITY_TYPE,
        entity_id: input.placementId,
        action_type: "approve_enrollment_handoff",
        payload: compactPayload(
            {
                placement_id: input.placementId,
                enrollment_agreement_id: input.enrollmentAgreementId,
                customer_member_id: input.customerMemberId,
                site_location_id: input.siteLocationId,
            },
            input.ctx
        ),
    });
}

export async function emitScheduleAssignmentCreatedEvent(input: {
    orgId: string;
    assignmentId: string;
    enrollmentAgreementId: string;
    schedulePatternId: string;
    customerMemberId: string;
    ctx?: EmitContext;
}): Promise<string> {
    return emitEvent({
        org_id: input.orgId,
        event_type: SCHEDULE_ASSIGNMENT_CREATED_EVENT,
        entity_type: SCHEDULE_ASSIGNMENT_ENTITY_TYPE,
        entity_id: input.assignmentId,
        action_type: "approve_enrollment_handoff",
        payload: compactPayload(
            {
                assignment_id: input.assignmentId,
                enrollment_agreement_id: input.enrollmentAgreementId,
                schedule_pattern_id: input.schedulePatternId,
                customer_member_id: input.customerMemberId,
            },
            input.ctx
        ),
    });
}

export async function emitOperationalEnrollmentHandoffSummaryEvent(input: {
    orgId: string;
    opportunityId: string;
    partial: boolean;
    childCount: number;
    warnings: string[];
    ctx?: EmitContext;
}): Promise<string> {
    return emitEvent({
        org_id: input.orgId,
        event_type: input.partial
            ? OPERATIONAL_ENROLLMENT_HANDOFF_PARTIAL_EVENT
            : OPERATIONAL_ENROLLMENT_HANDOFF_COMPLETED_EVENT,
        entity_type: OPPORTUNITY_ENTITY_TYPE,
        entity_id: input.opportunityId,
        action_type: "approve_enrollment_handoff",
        payload: compactPayload(
            {
                opportunity_id: input.opportunityId,
                child_count: input.childCount,
                warnings: input.warnings,
                partial: input.partial,
            },
            input.ctx
        ),
    });
}

export async function emitPlacementChangedEvent(input: {
    orgId: string;
    placementId: string;
    enrollmentAgreementId: string;
    customerMemberId: string;
    siteLocationId: string;
    startDate: string;
    supersedesPlacementId?: string | null;
    priorPlacementCloseDate?: string | null;
    sourceKey?: string | null;
    ctx?: EmitContext;
}): Promise<string> {
    return emitEvent({
        org_id: input.orgId,
        event_type: PLACEMENT_CHANGED_EVENT,
        entity_type: CHILD_PLACEMENT_ENTITY_TYPE,
        entity_id: input.placementId,
        action_type: OPERATOR_ENROLLMENT_EDIT_ACTION,
        payload: compactPayload(
            {
                placement_id: input.placementId,
                enrollment_agreement_id: input.enrollmentAgreementId,
                customer_member_id: input.customerMemberId,
                site_location_id: input.siteLocationId,
                start_date: input.startDate,
                supersedes_placement_id: input.supersedesPlacementId ?? null,
                prior_placement_close_date: input.priorPlacementCloseDate ?? null,
                source_key: input.sourceKey ?? null,
            },
            input.ctx
        ),
    });
}

export async function emitScheduleAssignmentChangedEvent(input: {
    orgId: string;
    assignmentId: string;
    enrollmentAgreementId: string;
    schedulePatternId: string;
    customerMemberId: string;
    startDate: string;
    supersedesAssignmentId?: string | null;
    priorAssignmentCloseDate?: string | null;
    sourceKey?: string | null;
    ctx?: EmitContext;
}): Promise<string> {
    return emitEvent({
        org_id: input.orgId,
        event_type: SCHEDULE_ASSIGNMENT_CHANGED_EVENT,
        entity_type: SCHEDULE_ASSIGNMENT_ENTITY_TYPE,
        entity_id: input.assignmentId,
        action_type: OPERATOR_ENROLLMENT_EDIT_ACTION,
        payload: compactPayload(
            {
                assignment_id: input.assignmentId,
                enrollment_agreement_id: input.enrollmentAgreementId,
                schedule_pattern_id: input.schedulePatternId,
                customer_member_id: input.customerMemberId,
                start_date: input.startDate,
                supersedes_assignment_id: input.supersedesAssignmentId ?? null,
                prior_assignment_close_date: input.priorAssignmentCloseDate ?? null,
                source_key: input.sourceKey ?? null,
            },
            input.ctx
        ),
    });
}

export async function emitAgreementEndingScheduledEvent(input: {
    orgId: string;
    agreementId: string;
    customerMemberId: string;
    siteLocationId: string;
    endDate: string;
    ctx?: EmitContext;
}): Promise<string> {
    return emitEvent({
        org_id: input.orgId,
        event_type: AGREEMENT_ENDING_SCHEDULED_EVENT,
        entity_type: ENROLLMENT_AGREEMENT_ENTITY_TYPE,
        entity_id: input.agreementId,
        action_type: OPERATOR_ENROLLMENT_EDIT_ACTION,
        payload: compactPayload(
            {
                agreement_id: input.agreementId,
                customer_member_id: input.customerMemberId,
                site_location_id: input.siteLocationId,
                end_date: input.endDate,
            },
            input.ctx
        ),
    });
}

export async function emitAgreementEndedEvent(input: {
    orgId: string;
    agreementId: string;
    customerMemberId: string;
    siteLocationId: string;
    endDate: string | null;
    ctx?: EmitContext;
}): Promise<string> {
    return emitEvent({
        org_id: input.orgId,
        event_type: AGREEMENT_ENDED_EVENT,
        entity_type: ENROLLMENT_AGREEMENT_ENTITY_TYPE,
        entity_id: input.agreementId,
        action_type: OPERATOR_ENROLLMENT_EDIT_ACTION,
        payload: compactPayload(
            {
                agreement_id: input.agreementId,
                customer_member_id: input.customerMemberId,
                site_location_id: input.siteLocationId,
                end_date: input.endDate,
            },
            input.ctx
        ),
    });
}

export async function emitAgreementCanceledEvent(input: {
    orgId: string;
    agreementId: string;
    customerMemberId: string;
    siteLocationId: string;
    ctx?: EmitContext;
}): Promise<string> {
    return emitEvent({
        org_id: input.orgId,
        event_type: AGREEMENT_CANCELED_EVENT,
        entity_type: ENROLLMENT_AGREEMENT_ENTITY_TYPE,
        entity_id: input.agreementId,
        action_type: OPERATOR_ENROLLMENT_EDIT_ACTION,
        payload: compactPayload(
            {
                agreement_id: input.agreementId,
                customer_member_id: input.customerMemberId,
                site_location_id: input.siteLocationId,
            },
            input.ctx
        ),
    });
}
