/**
 * Access presentation contracts — type stubs for view models the Access product UI is designed
 * against but that have **no backing API yet**. These are documentation-as-types: they let the
 * UI reference a named shape (and render an honest "Planned" state) instead of inventing ad hoc
 * fields or fabricating data.
 *
 * Do NOT implement fetchers against these types until a real API exists. Planned surfaces must
 * render static/deterministic copy, not a request that 404s.
 *
 * UI-only artifact — no schema, no runtime behavior. See:
 * `.alloy-agent-evidence/access-ui-discovery/ACCESS-UI-DISCOVERY.md`
 */

/** Aggregate workspace view for one user: identity + role + scope + planned projections. */
export type UserAccessWorkspaceVm = {
    userId: string;
    displayName: string;
    email: string | null;
    /** Human label — never the raw role_key in primary UI. */
    roleLabel: string;
    roleKey: string;
    isActive: boolean;
    locationSummary: string;
    departmentSummary: string;
    /** Only "password" is real today; other methods are Planned. */
    authenticationMethod: "password";
};

/** Permission catalog shaped for operator-facing display (grid rows, not raw permission_keys). */
export type PermissionCatalogVm = {
    groupKey: string;
    groupLabel: string;
    rows: {
        id: string;
        label: string;
        level: "none" | "read" | "write";
    }[];
};

/**
 * Planned: derived read-only projection of "what a role can see/do" across product surfaces
 * (queues, drawers, actions) beyond raw permission grants. No API exists yet — every consumer
 * must render the Planned empty state rather than call a fabricated endpoint.
 */
export type ExperienceAccessVm = {
    roleKey: string;
    surfaces: {
        surfaceKey: string;
        surfaceLabel: string;
        accessLevel: "none" | "read" | "write";
    }[];
};

/**
 * Planned: verified account-lifecycle timeline for a single user (invited, role changed, access
 * scope changed, password reset sent, removed). No history table/event feed exists yet.
 */
export type UserHistoryVm = {
    userId: string;
    entries: {
        id: string;
        occurredAt: string;
        title: string;
        detail: string;
    }[];
};

/**
 * Planned: verified change timeline for a role definition (label changes, activation changes,
 * permission grant changes). No history table/event feed exists yet.
 */
export type RoleHistoryVm = {
    roleKey: string;
    entries: {
        id: string;
        occurredAt: string;
        title: string;
        detail: string;
    }[];
};

/**
 * Planned: organization-wide access audit log (sign-ins, role/permission changes, access-scope
 * changes) across all users. No audit table/event feed exists yet.
 */
export type AccessAuditLogVm = {
    entries: {
        id: string;
        occurredAt: string;
        actorLabel: string;
        action: string;
        targetLabel: string;
    }[];
};

/**
 * Planned: computed effective access for a user — the union of what their role grants plus their
 * location/department scope, resolved into plain-language statements. No resolver exists yet;
 * `/api/admin/users/[userId]/access-scope` GET returns stored + resolved *scope* dimensions only,
 * not full effective-permission resolution.
 */
export type EffectiveAccessVm = {
    userId: string;
    statements: string[];
};
