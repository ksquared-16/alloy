/**
 * Contextual completion / requirement guardrails (Sprint B foundation).
 * Structured output is BOS-readable — see `bosIntegration.ts`.
 */

export const REQUIREMENT_TYPES = [
    "always_required",
    "required_on_save",
    "required_before_status_transition",
    "required_before_action",
    "required_by_role",
    "required_by_profile",
    "required_by_lifecycle_stage",
    "recommended_non_blocking",
] as const;

export type RequirementType = (typeof REQUIREMENT_TYPES)[number];

export const BLOCKING_LEVELS = ["hard_block", "soft_warning", "recommendation"] as const;

export type BlockingLevel = (typeof BLOCKING_LEVELS)[number];

export type CompletionEvaluationPhase = "save" | "status_change" | "action" | "preview";

export type RequirementViolationContext = {
    surface?: string;
    action_key?: string;
    status_from?: string;
    status_to?: string;
    lifecycle_stage?: string;
    role_key?: string;
    profile_key?: string;
    layout_variant_key?: string;
    /** Persisted requirement level when evaluated from lifecycle field rules. */
    requirement_level?: "recommended" | "required" | "enforced";
    rule_id?: string;
};

export type RequirementViolation = {
    entity_type: string;
    entity_id: string;
    field_key?: string;
    section_key?: string;
    label: string;
    requirement_type: RequirementType;
    blocking_level: BlockingLevel;
    missing_reason: string;
    context: RequirementViolationContext;
};

export type RequirementValidationResult = {
    ok: boolean;
    blocking: RequirementViolation[];
    warnings: RequirementViolation[];
    recommendations: RequirementViolation[];
};

export type CompletionEntityType = "person" | "opportunity" | "customer" | "inquiry_child";

export type CompletionEvaluationContext = {
    phase: CompletionEvaluationPhase;
    org_id?: string;
    entity_type: CompletionEntityType;
    entity_id: string;
    surface?: string;
    status_from?: string | null;
    status_to?: string | null;
    action_key?: string | null;
    role_keys?: string[];
    profile_keys?: string[];
    /** Sprint A layout variant key when evaluated from runtime person drawer. */
    layout_variant_key?: string;
    /** Merged native + custom field values for evaluation. */
    values: Record<string, unknown>;
    /** Related records for cross-entity rules (household, inquiry children). */
    related?: CompletionRelatedContext;
};

export type PrimaryPersonSnapshot = {
    person_id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
};

export type CompletionRelatedContext = {
    customer_id?: string | null;
    inquiry_children?: InquiryChildCompletionSnapshot[];
    /** Department `metadata` for lifecycle requirement overrides (action preflight). */
    department_metadata?: Record<string, unknown> | null;
    /** Primary contact on opportunity — used for field-level lifecycle rules. */
    primary_person?: PrimaryPersonSnapshot;
    household_guardian_count?: number;
    household_has_primary_contact?: boolean;
    customer_persons?: Array<{ role_type?: string | null; is_primary?: boolean | null; customer_id?: string | null }>;
    customer_members?: Array<{ relationship?: string | null }>;
    person_relationships?: Array<{
        from_person_id: string;
        to_person_id: string;
        relationship_type?: string | null;
    }>;
    opportunity_person_roles?: Array<{ role_type?: string | null }>;
};

export type InquiryChildCompletionSnapshot = {
    id?: string;
    person_id?: string | null;
    customer_member_id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    location_id?: string | null;
    program_category_id?: string | null;
    program_room_cohort_key?: string | null;
    schedule_type?: string | null;
    start_date?: string | null;
    outcome_status_key?: string | null;
    /** Assignment proposal — days/week intent (PI metadata overlay). */
    requested_days_per_week?: number | string | null;
    /** Preferred weekdays 0–6 (PI metadata overlay; not committed schedule). */
    weekdays?: number[] | null;
    tuition_plan_id?: string | null;
    quote_accepted?: boolean | string | null;
    enrollment_date?: string | null;
    /** Profile fields — hydrated from customer_member when available. */
    dob?: string | null;
    date_of_birth?: string | null;
    preferred_name?: string | null;
    gender?: string | null;
    allergies?: string | null;
    medical_notes?: string | null;
    special_instructions?: string | null;
    custom_fields?: Record<string, unknown> | null;
};

export const COMPLETION_REQUIREMENT_VALIDATION_ERROR = "Completion requirements not met";
