export type DefaultRoleDefinition = {
    role_key: string;
    role_label: string;
    description: string | null;
};

/**
 * Org-scoped system roles we expect to exist in `role_definitions`.
 *
 * These are used as a server-side fallback for UI visibility and API stability;
 * a DB migration should also backfill these per-org so role assignment validation
 * (PATCH /users/:id/role, POST /users) continues to rely on `role_definitions`.
 */
export const DEFAULT_ORG_ROLE_DEFINITIONS: readonly DefaultRoleDefinition[] = [
    { role_key: "admin", role_label: "Admin", description: "Full access" },
    { role_key: "ops", role_label: "Ops", description: "Operational access" },
    { role_key: "regional_lead", role_label: "Regional lead", description: "Regional manager persona" },
    { role_key: "school_director", role_label: "School director", description: "Site director persona" },
] as const;

export type RoleDefinitionRow = {
    role_key: string;
    role_label: string;
    is_system: boolean;
    is_active: boolean;
    created_at: string | null;
};

/**
 * Merge DB rows with expected defaults (no DB writes).
 * - Keeps DB rows as the source of truth when present.
 * - Adds missing defaults as `is_system=true`, `is_active=true`, `created_at=null`.
 */
export function mergeRoleDefinitionsWithDefaults(rows: RoleDefinitionRow[]): RoleDefinitionRow[] {
    const byKey = new Map<string, RoleDefinitionRow>();
    for (const r of rows) byKey.set(r.role_key, r);

    for (const d of DEFAULT_ORG_ROLE_DEFINITIONS) {
        if (byKey.has(d.role_key)) continue;
        byKey.set(d.role_key, {
            role_key: d.role_key,
            role_label: d.role_label,
            is_system: true,
            is_active: true,
            created_at: null,
        });
    }

    return [...byKey.values()].sort((a, b) => {
        if (a.is_system !== b.is_system) return a.is_system ? -1 : 1;
        return a.role_label.localeCompare(b.role_label);
    });
}

