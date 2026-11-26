/**
 * Enrollment status transition — child/OCM-scoped operator action contract.
 * Replaces case-only "Update Status" for enrollment business processes.
 */

import type { LifecycleOperatorStage } from "@/lib/completion/lifecycleProgressionRequirementsCatalog";

export const UPDATE_ENROLLMENT_STATUS_ACTION_KEY = "update_enrollment_status" as const;

/** Legacy BP / placement key — routes to the same modal + executor. */
export const LEGACY_UPDATE_STATUS_ADD_NOTE_KEY = "update_status_add_note" as const;

export const ENROLLMENT_STATUS_TRANSITION_FORM_KEY = "update_enrollment_status" as const;

export type EnrollmentStatusTransitionGrain = "case" | "child" | "candidate";

export type EnrollmentStatusTransitionSourceSurface =
    | "queue_row"
    | "opportunity_drawer"
    | "child_drawer"
    | "person_drawer"
    | "layout_button"
    | "bos_rail";

/** Operator-facing destination bucket (BP stage semantics). */
export type EnrollmentStatusDestinationKey =
    | LifecycleOperatorStage
    | "closed_withdrawn";

export type EnrollmentStatusTransitionScope = {
    grain: EnrollmentStatusTransitionGrain;
    opportunityId: string;
    /** Child subject = customer_members.id. Threaded so movement targets the process instance directly. */
    customerMemberId?: string | null;
    opportunityCustomerMemberId?: string | null;
    placementCandidateId?: string | null;
    /** Pre-selected child display name when known. */
    childDisplayName?: string | null;
};

export type EnrollmentStatusTransitionExecutionRequest = {
    actionKey: typeof UPDATE_ENROLLMENT_STATUS_ACTION_KEY;
    scope: EnrollmentStatusTransitionScope;
    destinationKey: EnrollmentStatusDestinationKey;
    /** Resolved OCM outcome_status_key or opportunity status_key for case fallback. */
    targetStatusKey: string;
    confirmationRequired: true;
    reason?: string | null;
    note?: string | null;
    /** Required when skipping tour requirement to reach waitlist. */
    bypassReason?: string | null;
    sourceSurface?: EnrollmentStatusTransitionSourceSurface;
};

export type EnrollmentStatusTransitionChildOption = {
    opportunityCustomerMemberId: string;
    displayName: string;
    outcomeStatusKey: string | null;
    outcomeStatusLabel: string;
    operatorStageKey: string | null;
};

export type EnrollmentStatusTransitionDestinationOption = {
    destinationKey: EnrollmentStatusDestinationKey;
    label: string;
    defaultStatusKey: string;
    entityType: "opportunity_customer_members" | "opportunities";
    /** Parking-lot stages reachable from multiple origins. */
    parkingLot?: boolean;
    /** BP outcome key when resolved from stage_operating_plan_v1. */
    outcomeKey?: string;
    builderStageKey?: string;
    bpSource?: "stage_outcome" | "parking_lot" | "split_rule" | "default";
    requiresTourBypass?: boolean;
    ruleKey?: string;
};

export const ENROLLMENT_STATUS_BYPASS_REASON_OPTIONS = [
    "No space available",
    "Family requested waitlist",
    "Deferring tour",
    "Other",
] as const;

export function isEnrollmentStatusTransitionActionKey(key: string): boolean {
    const k = key.trim();
    return k === UPDATE_ENROLLMENT_STATUS_ACTION_KEY || k === LEGACY_UPDATE_STATUS_ADD_NOTE_KEY;
}

export function isEnrollmentStatusTransitionFormKey(formKey: string): boolean {
    return formKey.trim() === ENROLLMENT_STATUS_TRANSITION_FORM_KEY;
}
