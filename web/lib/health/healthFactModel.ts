/**
 * THE CANONICAL HEALTH FACT — one entity, four kinds.
 *
 * Per `docs/platform/operator/health-foundation-h1-h4-contract.md` (H1). Three tables would give
 * the collection resolver three shapes, three provider kinds and three correction lineages for one
 * idea — "a durable health fact about a person" — and immunization would still fit none of them.
 *
 * ── WHAT HEALTH OWNS, AND WHAT IT DOES NOT ──
 *
 *   Enrollment / Forms      collect configured health information
 *   Processing / Trust      interpret, resolve ambiguity, propose — and never write
 *   Documents               hold the evidence artifact
 *   Business Process        own requirement applicability and readiness
 *   Relationships           own physician / dentist / emergency contacts
 *   Health (this)           owns APPROVED DURABLE TRUTH, and nothing else
 *
 * Requirement satisfaction is deliberately absent: it is evaluated at read time from evidence, and
 * storing "immunization_document_present = true" would be a second answer that drifts from the
 * documents that justify it.
 */

export const HEALTH_FACT_KINDS = ["allergy", "condition", "medication", "immunization"] as const;
export type HealthFactKind = (typeof HEALTH_FACT_KINDS)[number];

export const HEALTH_FACT_STATUSES = ["active", "ended", "superseded"] as const;
export type HealthFactStatus = (typeof HEALTH_FACT_STATUSES)[number];

export const HEALTH_FACT_SOURCE_KINDS = [
    "form_submission",
    "document_extraction",
    "operator",
    "import",
] as const;
export type HealthFactSourceKind = (typeof HEALTH_FACT_SOURCE_KINDS)[number];

/** The child grain the whole contract assumes (D-H1); `person` admits a staff member's own facts. */
export const HEALTH_SUBJECT_TYPES = ["customer_member", "person"] as const;
export type HealthSubjectType = (typeof HEALTH_SUBJECT_TYPES)[number];

export type PersonHealthFactRow = {
    id: string;
    org_id: string;
    subject_entity_type: HealthSubjectType;
    subject_entity_id: string;
    fact_kind: HealthFactKind;
    payload: Record<string, unknown>;
    status: HealthFactStatus;
    effective_from: string | null;
    effective_to: string | null;
    source_kind: HealthFactSourceKind;
    source_ref: string | null;
    confirmed_by: string | null;
    confirmed_at: string | null;
    supersedes_id: string | null;
    related_fact_id: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
};

export const PERSON_HEALTH_FACTS_TABLE = "person_health_facts";

export const PERSON_HEALTH_FACT_SELECT =
    "id, org_id, subject_entity_type, subject_entity_id, fact_kind, payload, status, "
    + "effective_from, effective_to, source_kind, source_ref, confirmed_by, confirmed_at, "
    + "supersedes_id, related_fact_id, metadata, created_at, updated_at";

/**
 * SEVERITY IS CARRIED, NEVER RECOMPUTED.
 *
 * A severity that arrived from Trust is the interpretation Trust made and an operator approved.
 * Re-deriving it here — from the allergen, from the reaction text — would be Health quietly
 * overruling the owner of interpretation, and the two answers would differ in exactly the cases
 * that matter most.
 */
export const HEALTH_SEVERITIES = ["life_threatening", "severe", "moderate", "mild"] as const;
export type HealthSeverity = (typeof HEALTH_SEVERITIES)[number];

/** Severities that make a fact CRITICAL — the summary's top region. Ordered most severe first. */
export const CRITICAL_SEVERITIES: readonly HealthSeverity[] = ["life_threatening", "severe"];

export function isHealthFactKind(v: unknown): v is HealthFactKind {
    return typeof v === "string" && (HEALTH_FACT_KINDS as readonly string[]).includes(v);
}

export function isHealthSeverity(v: unknown): v is HealthSeverity {
    return typeof v === "string" && (HEALTH_SEVERITIES as readonly string[]).includes(v);
}

function str(v: unknown): string | null {
    const s = v != null ? String(v).trim() : "";
    return s || null;
}

/**
 * The per-kind payload readers.
 *
 * Deliberately TOLERANT of missing keys and deliberately INTOLERANT of inventing them: a payload
 * that does not state a severity has none, and this returns null rather than a default. A default
 * severity on an allergy is the single most dangerous value this module could produce.
 */
export type AllergyPayload = {
    allergen: string | null;
    severity: HealthSeverity | null;
    reaction: string | null;
    careInstructions: string | null;
    treatment: string | null;
};

export function readAllergyPayload(payload: Record<string, unknown>): AllergyPayload {
    return {
        allergen: str(payload.allergen),
        severity: isHealthSeverity(payload.severity) ? payload.severity : null,
        reaction: str(payload.reaction),
        careInstructions: str(payload.care_instructions),
        treatment: str(payload.treatment),
    };
}

export type ConditionPayload = {
    condition: string | null;
    severity: HealthSeverity | null;
    restrictions: string | null;
    careInstructions: string | null;
};

export function readConditionPayload(payload: Record<string, unknown>): ConditionPayload {
    return {
        condition: str(payload.condition) ?? str(payload.condition_type),
        severity: isHealthSeverity(payload.severity) ? payload.severity : null,
        restrictions: str(payload.restrictions),
        careInstructions: str(payload.care_instructions),
    };
}

export type MedicationPayload = {
    medication: string | null;
    dosage: string | null;
    frequency: string | null;
    /** True when the medication is given as needed rather than on a schedule. */
    asNeeded: boolean;
    administrationInstructions: string | null;
    storageLocation: string | null;
};

export function readMedicationPayload(payload: Record<string, unknown>): MedicationPayload {
    return {
        medication: str(payload.medication),
        dosage: str(payload.dosage),
        frequency: str(payload.frequency),
        asNeeded: payload.as_needed === true || payload.prn === true,
        administrationInstructions: str(payload.administration_instructions),
        storageLocation: str(payload.storage_location),
    };
}

export type ImmunizationDose = { administeredOn: string | null; doseNumber: number | null };

export type ImmunizationPayload = {
    vaccineKey: string | null;
    doses: ImmunizationDose[];
    /** e.g. had-the-disease. NOT exemption — exemption is a Business Process requirement exception. */
    historyState: string | null;
};

export function readImmunizationPayload(payload: Record<string, unknown>): ImmunizationPayload {
    const raw = Array.isArray(payload.doses) ? payload.doses : [];
    return {
        vaccineKey: str(payload.vaccine_key),
        // Doses are ORDERED VALUES OF ONE FACT — nothing references a single dose — which is what
        // keeps the collection grain uniform and stops immunization needing its own resolver arm.
        doses: raw
            .map((d) => {
                const row = (d ?? {}) as Record<string, unknown>;
                const n = Number(row.dose_number);
                return {
                    administeredOn: str(row.administered_on),
                    doseNumber: Number.isFinite(n) ? n : null,
                };
            })
            .sort((a, b) => (a.doseNumber ?? 0) - (b.doseNumber ?? 0)),
        historyState: str(payload.history_state),
    };
}

/** A one-line operator-facing label for any kind, without exposing storage taxonomy. */
export function healthFactLabel(row: Pick<PersonHealthFactRow, "fact_kind" | "payload">): string {
    switch (row.fact_kind) {
        case "allergy":
            return readAllergyPayload(row.payload).allergen ?? "Allergy";
        case "condition":
            return readConditionPayload(row.payload).condition ?? "Condition";
        case "medication":
            return readMedicationPayload(row.payload).medication ?? "Medication";
        case "immunization":
            return readImmunizationPayload(row.payload).vaccineKey ?? "Immunization";
    }
}
