/**
 * W-61 — the shape of a role definition, and deliberately nothing else.
 *
 * This module used to export `DEFAULT_ORG_ROLE_DEFINITIONS`, a hard-coded four-role
 * constant, and `mergeRoleDefinitionsWithDefaults`, which added any missing member of
 * it to every `GET /api/admin/rbac/roles` response as `is_system: true, is_active: true`.
 * Both are removed. They were a **fifth role vocabulary** (`01…§50`) and they contradicted
 * the database's own header — *"Role definitions are seeded by the database, never
 * fabricated at read time"* (`…phase0…sql:167-168`).
 *
 * The fabrication was not cosmetic. A fabricated role has no `role_definitions` row, and
 * `role_permission_grants.(org_id, role_key)` is foreign-keyed to that table: the editor
 * listed the role, the operator authored grants against it, and the FK rejected the write
 * with a constraint error rather than a stated one. The defect was a fabricated vocabulary
 * and an opaque failure.
 *
 * Removing it is safe today and a lock for tomorrow, which is exactly what the `Q16` census
 * asked. `Q16` — *which orgs are missing one or more of the four default rows* — is answered
 * from the repository rather than the database, because the schema makes the answer
 * structural: `20260729120000_access_v2_phase0_catalog_and_role_definition_integrity.sql`
 * installs an `AFTER INSERT` trigger on `public.orgs` that seeds all four rows for every new
 * org, AND backfills every org existing at that migration in an idempotent `DO` block. There
 * is no window between the two, so no org is served by fabrication and the count is zero.
 *
 * If that invariant is ever broken, the role list is now short rather than fabricated — which
 * is the truthful failure, and the one an operator can act on.
 */
export type RoleDefinitionRow = {
    role_key: string;
    role_label: string;
    is_system: boolean;
    is_active: boolean;
    created_at: string | null;
};

