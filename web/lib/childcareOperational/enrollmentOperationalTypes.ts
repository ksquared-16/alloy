/**
 * Row shapes for childcare operational enrollment tables (slice 1 schema).
 */

import type {
    ChildEnrollmentAgreementStatus,
    ChildPlacementStatus,
    ScheduleAssignmentStatus,
} from "@/lib/childcareOperational/enrollmentOperationalStatus";

export type ChildEnrollmentAgreementRow = {
    id: string;
    org_id: string;
    opportunity_id: string | null;
    opportunity_customer_member_id: string | null;
    customer_member_id: string;
    customer_id: string | null;
    person_id: string | null;
    site_location_id: string;
    status: ChildEnrollmentAgreementStatus;
    start_date: string | null;
    end_date: string | null;
    activation_policy_key: string | null;
    source_key: string;
    metadata: Record<string, unknown>;
    created_by: string | null;
    updated_by: string | null;
    created_at: string;
    updated_at: string;
};

export type ChildPlacementRow = {
    id: string;
    org_id: string;
    enrollment_agreement_id: string;
    customer_member_id: string;
    site_location_id: string;
    program_category_id: string | null;
    room_location_id: string | null;
    start_date: string;
    end_date: string | null;
    status: ChildPlacementStatus;
    reason_key: string | null;
    source_key: string;
    supersedes_placement_id: string | null;
    metadata: Record<string, unknown>;
    created_by: string | null;
    updated_by: string | null;
    created_at: string;
    updated_at: string;
};

export type SchedulePatternRow = {
    id: string;
    org_id: string;
    site_location_id: string;
    key: string;
    label: string;
    schedule_type_key: string;
    weekdays: number[];
    sort_order: number;
    is_active: boolean;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string | null;
};

export type ScheduleAssignmentRow = {
    id: string;
    org_id: string;
    enrollment_agreement_id: string;
    schedule_pattern_id: string;
    customer_member_id: string;
    start_date: string;
    end_date: string | null;
    status: ScheduleAssignmentStatus;
    assignment_kind: string;
    source_key: string;
    supersedes_assignment_id: string | null;
    metadata: Record<string, unknown>;
    created_by: string | null;
    updated_by: string | null;
    created_at: string;
    updated_at: string;
};

export type LocationLabelRow = {
    id: string;
    label: string | null;
    location_type: string | null;
};

export type ProgramCategoryLabelRow = {
    id: string;
    label: string;
    key: string;
};
