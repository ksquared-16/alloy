/**
 * Resilient selects for location_program_categories across schema drift.
 *
 * Publication migration adds program_id / program_revision_id / local_*.
 * Some staging DBs still have assignment_* revision columns instead.
 * Core identity columns exist on all known shapes.
 */

export const LOCATION_PROGRAM_CATEGORY_SELECT_PUBLICATION =
    "id, org_id, location_id, key, label, sort_order, is_active, metadata, program_id, program_revision_id, configuration_consumption_id, local_description_override, local_authorization_evidence, created_at, updated_at";

export const LOCATION_PROGRAM_CATEGORY_SELECT_ASSIGNMENT =
    "id, org_id, location_id, key, label, sort_order, is_active, metadata, created_at, updated_at, assignment_status, assigned_program_revision_id, consumed_program_revision_id";

export const LOCATION_PROGRAM_CATEGORY_SELECT_CORE =
    "id, org_id, location_id, key, label, sort_order, is_active, metadata, created_at, updated_at";

export const LOCATION_PROGRAM_CATEGORY_SELECT_ATTEMPTS = [
    LOCATION_PROGRAM_CATEGORY_SELECT_PUBLICATION,
    LOCATION_PROGRAM_CATEGORY_SELECT_ASSIGNMENT,
    LOCATION_PROGRAM_CATEGORY_SELECT_CORE,
] as const;

export const LOCATION_PROGRAM_CATEGORY_IDENTITY_SELECT_ATTEMPTS = [
    "program_revision_id",
    "assigned_program_revision_id, consumed_program_revision_id",
    "id",
] as const;

export function isMissingColumnError(error: { message?: string; code?: string } | null | undefined): boolean {
    if (!error) return false;
    const message = String(error.message ?? "");
    const code = String(error.code ?? "");
    return (
        code === "42703" ||
        /column .* does not exist/i.test(message) ||
        /Could not find the '.+' column/i.test(message) ||
        /schema cache/i.test(message)
    );
}

export function resolveProgramRevisionIdFromRow(row: Record<string, unknown> | null | undefined): string | null {
    if (!row) return null;
    for (const key of ["program_revision_id", "assigned_program_revision_id", "consumed_program_revision_id"] as const) {
        const value = String(row[key] ?? "").trim();
        if (value) return value;
    }
    return null;
}

export function stripUnavailableProgramCategoryPatchFields(
    patch: Record<string, unknown>,
    error: { message?: string } | null | undefined,
): Record<string, unknown> | null {
    if (!isMissingColumnError(error)) return null;
    const message = String(error?.message ?? "");
    const next = { ...patch };
    let changed = false;
    for (const field of [
        "program_id",
        "program_revision_id",
        "configuration_consumption_id",
        "local_description_override",
        "local_authorization_evidence",
    ] as const) {
        if (Object.prototype.hasOwnProperty.call(next, field) && message.includes(field)) {
            delete next[field];
            changed = true;
        }
    }
    // If the error does not name a field, drop publication-only writes and retry core patch.
    if (!changed) {
        for (const field of [
            "program_id",
            "program_revision_id",
            "configuration_consumption_id",
            "local_description_override",
            "local_authorization_evidence",
        ] as const) {
            if (Object.prototype.hasOwnProperty.call(next, field)) {
                delete next[field];
                changed = true;
            }
        }
    }
    return changed ? next : null;
}
