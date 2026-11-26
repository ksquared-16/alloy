/**
 * Person-first intake hints carried on `payload.meta` for public lead_capture flows.
 * Maps to CRM rows without introducing a parallel intake model.
 */
export type FormIntakeGuardianHint = {
    email?: string | null;
    phone?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    /** Canonical person id when the guardian came from an EXISTING collection instance. */
    person_id?: string | null;
};

/** One guardian instance as submitted in a collection-bound group. */
export type FormIntakeGuardianInstance = FormIntakeGuardianHint & {
    group_id?: string;
    instance_key?: string;
    origin?: "existing" | "respondent_added";
    order_index?: number;
};

export type FormIntakeChildHint = {
    display_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    dob?: string | null;
    /** Child-level site (`opportunity_customer_members.location_id`). */
    location_id?: string | null;
    /** Waitlist cohort key (`opportunity_customer_members.program_room_cohort_key`). */
    program_room_cohort_key?: string | null;
    /** Stable program key captured on the form; resolved to `opportunity_customer_members.program_category_id` at apply time. */
    program_key?: string | null;
    schedule_type?: string | null;
    start_date?: string | null;
};

export type FormIntakeOpportunityHint = {
    name?: string | null;
    status_key?: string | null;
    pipeline_stage_id?: string | null;
    metadata?: Record<string, unknown> | null;
};

export type FormIntakeMeta = {
    vertical_id?: string | null;
    guardian?: FormIntakeGuardianHint | null;
    child?: FormIntakeChildHint | null;
    /** When set, each entry is a distinct child — do not duplicate into `child`. */
    children?: FormIntakeChildHint[] | null;
    opportunity?: FormIntakeOpportunityHint | null;
    /** Caller-supplied stable key; combined with submission id for idempotency trace only */
    idempotency_key?: string | null;
    /** Which representation the guardian was resolved from. */
    guardian_source?: "collection_envelope" | "flat_values";
    /** Set when flat values materially disagreed with the submitted collection — needs operator review. */
    guardian_conflict?: string | null;
    /** EVERY guardian the family submitted. Selecting a lead contact must not discard the others. */
    guardians?: FormIntakeGuardianInstance[] | null;
};

export function parseFormIntakeMeta(payloadMeta: unknown): FormIntakeMeta | null {
    if (!payloadMeta || typeof payloadMeta !== "object" || Array.isArray(payloadMeta)) return null;
    const m = payloadMeta as Record<string, unknown>;
    const intake = m.intake;
    if (!intake || typeof intake !== "object" || Array.isArray(intake)) return null;
    return intake as FormIntakeMeta;
}
