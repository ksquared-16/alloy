/**
 * Access presentation contracts — view-model shapes the Access product UI is designed
 * against. Some compose existing APIs today; others document Planned surfaces that must
 * not invent fetchers until a real backend exists.
 *
 * These are presentation contracts only — not sources of truth and not new domain tables.
 *
 * See: `docs/platform/operator/access-product-ui.md`
 * See: `.alloy-agent-evidence/access-ui-discovery/ACCESS-UI-DISCOVERY.md`
 */

/** Landing tiles for Access (Users / Roles / Security). */
export type AccessLandingVm = {
    tiles: {
        id: "users" | "roles" | "security";
        label: string;
        summary: string;
        href: string;
    }[];
};

/**
 * W-45 — these shapes used to type certainty into the model.
 *
 * `authenticationMethod: "password"` and `accountState: "active"` were **singleton literal types**:
 * the contract could not express a user who had been invited an hour ago, and a projection that
 * satisfied it was obliged to assert `Active`. `IA-1` counted four such assertions in the Users
 * chapter. A view model whose type admits only one answer is where that begins, so the lifecycle
 * and authentication states now come from `lib/access/memberIdentityProjection.ts`, which derives
 * them from the auth record and carries `unknown` **with a reason**.
 */
import type {
    MemberAuthenticationProjection,
    MemberLifecycleState,
} from "@/lib/access/memberIdentityProjection";

/** Users collection rail row. */
export type UsersCollectionVm = {
    users: {
        userId: string;
        displayName: string;
        email: string | null;
        roleLabel: string;
        locationSummary: string;
        departmentSummary: string;
        authentication: MemberAuthenticationProjection;
        accountState: MemberLifecycleState;
    }[];
};

/** Aggregate workspace view for one user: identity + role + scope + planned projections. */
export type UserAccessWorkspaceVm = {
    userId: string;
    displayName: string;
    email: string | null;
    /** Human label — never the raw role_key in primary UI. */
    roleLabel: string;
    roleKey: string;
    accountState: MemberLifecycleState;
    locationSummary: string;
    departmentSummary: string;
    authentication: MemberAuthenticationProjection;
};

export type UserOverviewVm = {
    userId: string;
    accountSnapshot: {
        accountState: string;
        invitationState: string | null;
        authenticationMethod: string;
        lastSignIn: string | null;
        linkedPersonLabel: string | null;
    };
    /** Planned until a resolver exists. */
    effectiveAccess: EffectiveAccessVm | null;
    securitySummary: {
        authenticationMethod: string;
        mfaStatus: "unsupported" | "planned";
        sessionState: "unsupported" | "planned";
    };
};

export type UserRolesVm = {
    userId: string;
    assignments: {
        roleKey: string;
        roleLabel: string;
        description: string | null;
        status: "active" | "inactive";
    }[];
    /** Existing API replaces with a single role. */
    multiRoleSupported: false;
};

export type UserScopeVm = {
    userId: string;
    /** W-47: `unset` — no access profile row — is not `all`, and the type must be able to say so. */
    locationScope: "all" | "selected" | "unset";
    locationLabels: string[];
    departmentScope: "all" | "selected" | "unset";
    departmentLabels: string[];
};

export type UserSecurityVm = {
    userId: string;
    accountState: MemberLifecycleState;
    authenticationMethods: AuthenticationMethodsVm;
    passwordResetAvailable: boolean;
    /** Factor presence is read; factor *policy* is Planned until W-36. */
    mfa: MemberAuthenticationProjection["mfa"];
    sessions: "planned";
};

/** Roles collection rail. */
export type RolesCollectionVm = {
    roles: {
        roleKey: string;
        roleLabel: string;
        description: string | null;
        userCount: number;
        isSystem: boolean;
        isActive: boolean;
    }[];
};

export type RoleAccessWorkspaceVm = {
    roleKey: string;
    roleLabel: string;
    description: string | null;
    isSystem: boolean;
    isActive: boolean;
    userCount: number;
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

export type RoleUsersVm = {
    roleKey: string;
    users: {
        userId: string;
        displayName: string;
        email: string | null;
        locationSummary: string;
        departmentSummary: string;
    }[];
};

export type AuthenticationMethodsVm = {
    methods: {
        id: string;
        label: string;
        status: "available" | "planned" | "unavailable";
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
        accessLevel: "none" | "view" | "operate" | "configure" | "full";
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
        actorLabel: string | null;
        source: string | null;
        result: "success" | "failure" | null;
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
        actorLabel: string | null;
        source: string | null;
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
        category: string;
        result: "success" | "failure" | "blocked" | null;
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
    statements: {
        capabilityLabel: string;
        accessLabel: string;
        locationSummary: string;
    }[];
};
