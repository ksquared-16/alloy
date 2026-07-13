/**
 * Canonical Program domain model (Phase A, A8).
 *
 * Ratified layering (RFC §6):
 *   Program IDENTITY      → the org-level `program_key` vocabulary
 *                           (backed today by the `childcare_program_type` option set)
 *   Program AVAILABILITY  → `location_program_categories` (offered-at-site rows)
 *   OFFERING (product)    → `program_offerings` / `program_offering_variants`
 *                           (a DISTINCT concept — NOT a duplicate Program)
 *   Room/program cohort   → derived projection
 *
 * Consumers depend ONLY on this model + the Program provider — never on the
 * option set internals — so identity can later become a first-class `programs`
 * entity with no consumer rewrite. No `programs` table is created in Phase A.
 *
 * Pure types only. No IO, no Supabase client, no UI dependency.
 */

export type CanonicalProgramStatus = "active" | "inactive";

/** Where a resolved program identity/label was derived from (explainability). */
export type CanonicalProgramSource =
    /** The canonical `program_key` vocabulary (option set today). */
    | "vocabulary"
    /** A per-location availability row (`location_program_categories`). */
    | "location_availability"
    /** Deprecated `classroom_age_group` compatibility fallback (retire in Phase E). */
    | "legacy_classroom_age_group";

/** Canonical Program identity — org-level, storage-agnostic. */
export type CanonicalProgram = {
    /** Stable vocabulary key, e.g. `infant` / `toddler` / `preschool`. */
    key: string;
    label: string;
    description: string | null;
    status: CanonicalProgramStatus;
    source: CanonicalProgramSource;
};

/**
 * A Program made available at a specific Location. Extends identity with the
 * per-site availability row's own id + ordering. Location-scoped resolution must
 * never return a program that is not available at that location.
 */
export type CanonicalProgramAvailability = CanonicalProgram & {
    locationId: string;
    /** `location_program_categories.id` — the availability-row id. */
    availabilityId: string;
    sortOrder: number;
};
