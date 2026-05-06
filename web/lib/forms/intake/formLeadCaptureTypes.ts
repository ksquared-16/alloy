/**
 * Person-first intake hints carried on `payload.meta` for public lead_capture flows.
 * Maps to CRM rows without introducing a parallel intake model.
 */
export type FormIntakeGuardianHint = {
    email?: string | null;
    phone?: string | null;
    first_name?: string | null;
    last_name?: string | null;
};

export type FormIntakeChildHint = {
    display_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    dob?: string | null;
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
    opportunity?: FormIntakeOpportunityHint | null;
    /** Caller-supplied stable key; combined with submission id for idempotency trace only */
    idempotency_key?: string | null;
};

export function parseFormIntakeMeta(payloadMeta: unknown): FormIntakeMeta | null {
    if (!payloadMeta || typeof payloadMeta !== "object" || Array.isArray(payloadMeta)) return null;
    const m = payloadMeta as Record<string, unknown>;
    const intake = m.intake;
    if (!intake || typeof intake !== "object" || Array.isArray(intake)) return null;
    return intake as FormIntakeMeta;
}
