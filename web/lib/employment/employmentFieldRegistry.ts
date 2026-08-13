/**
 * Employment — configurable field subject.
 *
 * Tenant/vertical staff facts (CPR expiry, background check date, training
 * hours, ratio qualification, food handler card) are **configured**, never
 * columns on `employments`. They bind to the employment relationship because
 * that is what they are scoped to: "training hours at this org, during this
 * employment period" is not a fact about the human in general, and it must not
 * follow a person across organizations.
 *
 * This reuses `field_definitions` / `field_values` unchanged — `entity_type` is
 * free text in the schema with no check constraint, and `person_child_relationship`
 * is the existing precedent for a *relationship* being a configurable subject.
 * The only extension needed is the API/Settings allowlist entry.
 *
 * There is deliberately no `staff_custom_fields` table, no JSON blob on
 * `employments`, and no staff-only field infrastructure.
 */

export const EMPLOYMENT_ENTITY_TYPE = "employment" as const;

export type EmploymentEntityType = typeof EMPLOYMENT_ENTITY_TYPE;

/**
 * Native employment columns. A configured field may not shadow one of these —
 * one canonical owner per business fact.
 */
export const EMPLOYMENT_NATIVE_FIELD_KEYS = [
    "employment_status",
    "employment_type",
    "position_id",
    "primary_location_id",
    "external_employee_id",
    "start_date",
    "end_date",
    "end_reason_key",
] as const;

const RESERVED = new Set<string>(EMPLOYMENT_NATIVE_FIELD_KEYS);

export function isReservedEmploymentFieldKey(fieldKey: string): boolean {
    return RESERVED.has(String(fieldKey ?? "").trim().toLowerCase());
}
