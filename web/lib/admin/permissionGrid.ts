export type PermissionGridLevel = "none" | "read" | "write";

export type PermissionGridRow = {
    id: string;
    label: string;
    /** permission_keys that represent "Read" for this area */
    readKeys: string[];
    /** permission_keys that represent "Write/Manage" for this area (Write implies Read in UI) */
    writeKeys: string[];
};

export const PERMISSION_GRID_ROWS: readonly PermissionGridRow[] = [
    { id: "opportunities", label: "Opportunities / Inquiries", readKeys: ["crm.opportunities.read"], writeKeys: ["crm.opportunities.write"] },
    { id: "customers", label: "Customers / Families", readKeys: ["crm.customers.read"], writeKeys: ["crm.customers.write"] },
    { id: "communications", label: "Communications", readKeys: ["communications.read"], writeKeys: ["communications.send"] },
    { id: "scheduling", label: "Scheduling", readKeys: ["scheduling.read"], writeKeys: ["scheduling.write"] },
    { id: "billing", label: "Billing / Payments", readKeys: ["billing.read"], writeKeys: ["billing.write"] },
    { id: "documents", label: "Documents", readKeys: ["documents.read"], writeKeys: ["documents.write"] },
    { id: "reports", label: "Reports / Analytics", readKeys: ["reports.read"], writeKeys: ["reports.write"] },
    { id: "settings", label: "Configuration", readKeys: ["settings.read"], writeKeys: ["settings.manage"] },
    // Users & Roles is also enforced by server gate on `settings.users_roles` (write/manage).
    { id: "users_roles", label: "Users & Roles", readKeys: ["settings.users_roles.read"], writeKeys: ["settings.users_roles"] },
    // W-3 (closes C5): the "Workflows / Automation" row named `workflows.read`/`workflows.write`,
    // which are seeded into no catalog table. `PUT /api/admin/rbac/grants` validates the whole
    // submission against `permission_definitions` *before* its delete-all-then-insert, so toggling
    // this row returned 400 and destroyed the operator's other selections on the screen.
    //
    // The row is removed rather than repointed, ratified by the operator 2026-07-31.
    //
    // The rationale at the time was that the plan's suggested repoint to `ops.workflows.*` could
    // not work, because those keys existed only in `permission_keys` and the grant would violate
    // `role_permission_grants_permissions_fkey`. **Both of those facts are now false**, and the
    // reader should not rely on them: migration
    // `20260729120000_access_v2_phase0_catalog_and_role_definition_integrity.sql` — vendored into
    // this repo at `555fa056a`, hours after this row was removed — seeds `ops.workflows.*` into
    // `permission_definitions` (:106-113) and drops that FK (:134) in favour of a single
    // `role_permission_grants_permission_definitions_fkey`. A repoint would now validate.
    //
    // What survives the correction is the part that never depended on the catalog: **no route
    // enforces `workflows.*`**, so the row grants nothing and its removal costs no authority.
    // W-10 regenerates the grid from the catalog, and the row returns on its own once W-11 seeds a
    // workflows capability that something enforces.
    //
    // Note the cross-track conflict, unresolved: that migration's own header asserts "the grid now
    // writes `ops.workflows.*`" and grants those keys to every org's `admin` role (:116-122) — an
    // expectation this file contradicts. See the Mission 2 re-verification record in §5 of the plan.
] as const;

export function keysForLevel(row: PermissionGridRow, level: PermissionGridLevel): string[] {
    if (level === "none") return [];
    if (level === "read") return [...row.readKeys];
    return [...new Set([...row.readKeys, ...row.writeKeys])];
}

export function levelFromGrantedKeys(row: PermissionGridRow, granted: Set<string>): PermissionGridLevel {
    const hasWrite = row.writeKeys.some((k) => granted.has(k));
    if (hasWrite) return "write";
    const hasRead = row.readKeys.some((k) => granted.has(k));
    if (hasRead) return "read";
    return "none";
}

/**
 * Apply one row's selection to a full set of grants.
 * Only touches keys defined by that row (unknown / out-of-grid keys are preserved).
 */
export function applyGridRowSelection(params: {
    row: PermissionGridRow;
    level: PermissionGridLevel;
    granted: Set<string>;
}): Set<string> {
    const { row, level, granted } = params;
    const next = new Set(granted);
    for (const k of [...row.readKeys, ...row.writeKeys]) next.delete(k);
    for (const k of keysForLevel(row, level)) next.add(k);
    return next;
}

