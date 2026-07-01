/**
 * Child placement scope validation — site vs program/cohort interest (Card 1).
 * Rate and classroom tables are not in schema yet; those checks are deferred.
 */

export type ChildPlacementScopeValidationIssue = {
    code: "missing_site" | "missing_cohort" | "cohort_without_site";
    message: string;
};

export type ChildPlacementScopeInput = {
    location_id?: string | null;
    program_room_cohort_key?: string | null;
    /** Reserved for Card 5+ when classroom/rate catalogs exist. */
    classroom_key?: string | null;
    rate_key?: string | null;
};

export type ChildPlacementScopeValidationResult = {
    ok: boolean;
    issues: ChildPlacementScopeValidationIssue[];
    /** Documented deferred checks — not run in Card 1. */
    deferred_checks: string[];
};

/**
 * Validates child-level scope fields that exist today.
 * Does not enforce classroom/rate ↔ site until catalog tables exist.
 */
export function validateChildPlacementScope(input: ChildPlacementScopeInput): ChildPlacementScopeValidationResult {
    const issues: ChildPlacementScopeValidationIssue[] = [];
    const site = (input.location_id ?? "").trim();
    const cohort = (input.program_room_cohort_key ?? "").trim();

    if (cohort && !site) {
        issues.push({
            code: "cohort_without_site",
            message: "Program / room cohort requires a selected child site.",
        });
    }

    const deferred_checks: string[] = [
        "classroom_belongs_to_site",
        "rate_belongs_to_site_and_program",
    ];

    if (input.classroom_key?.trim() || input.rate_key?.trim()) {
        deferred_checks.push("catalog_keys_present_but_not_validated");
    }

    return { ok: issues.length === 0, issues, deferred_checks };
}
