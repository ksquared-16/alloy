/**
 * Workspace visibility — role defaults plus optional per-user HIDE-ONLY overrides (Access V3, S5).
 *
 * ── WHAT THIS DECIDES, AND WHAT IT NEVER DECIDES ──
 *
 * Whether the product PUTS a workspace in front of an operator. It is not authorization: every
 * workspace's server routes enforce their own capability and refuse a direct call that never rendered
 * a screen, whether or not this module exists. Nothing here reads, returns or changes a grant that a
 * route or action consults — the result carries surface states only — so hiding a workspace can never
 * grant or remove a command, and an override can never show one.
 *
 * ── WHERE A ROLE DEFAULT COMES FROM ──
 *
 * Not from role NAMES. A role's default is what the role already grants: a workspace is shown by
 * default when one of the principal's held roles grants a capability that the workspace's own read
 * routes enforce (see `routeCapabilities.declared.json`).
 *
 * Where a workspace's read routes declare no DOMAIN capability, they still have an existing admission
 * rule: Tasks, Processing and Operations read through the portal-admission helpers, which admit exactly
 * the holders of `portal.access` (lib/admin/portalAdmission.ts). Their default MIRRORS that existing
 * rule (`basis: "portal_admission"`); it is not domain authority, grants nothing, and gives no role any
 * reach it lacks today. A workspace with neither a declared capability nor a verified admission rule
 * would be `not_governed` — this module never invents a role-to-workspace policy.
 *
 * Financials in the sidebar still uses its own, older module (`financialsSurfaceVisibility`), which
 * deliberately OFFERS the item when grants are unknown. That legacy fail-open choice is documented
 * there and is intentionally not harmonized here; this module's Financials answer fails closed.
 *
 * ── FAILS CLOSED ──
 *
 * An unknown principal, unknown grants, or a held role whose grants are unknown never shows a governed
 * workspace on the strength of what is not known: the state is `unknown`, not `hidden_by_role_default`,
 * so a caller can tell "still loading / not supplied" from "your roles do not include it".
 *
 * ── OVERRIDES (approved model; store held) ──
 *
 * The approved model is role defaults PLUS optional per-user overrides that can only HIDE. An override
 * is bound to one principal (user + organization), can only turn a shown workspace into a hidden one,
 * and is ignored for any other principal. The own-user contract, route and client loader live in
 * `workspaceVisibilityOverrides.ts` / `workspaceVisibilityOverrideLoader.ts`; the store itself (table,
 * RLS, audit) is a migration held for separate approval, so today every override resolves as absent.
 */

import { PORTAL_ADMISSION_CAPABILITY_KEY } from "@/lib/access/portalAdmissionKey";

export type WorkspaceSurfaceKey = "financials" | "inbox" | "analytics" | "tasks" | "processing" | "operations";

type GovernedSurface = {
    governed: true;
    /** `domain_capability`: a declared read capability. `portal_admission`: the existing portal gate only. */
    basis: "domain_capability" | "portal_admission";
    label: string;
    /** Any one of these, granted by a held role, shows the workspace by default. */
    readCapabilities: readonly string[];
    /** Where the capability is enforced server-side (the boundary this visibility is NOT). */
    enforcedBy: string;
};

type UngovernedSurface = {
    governed: false;
    label: string;
    /** Why existing contracts cannot determine a role default. */
    reason: string;
};

export const WORKSPACE_VISIBILITY_SURFACES: Readonly<Record<WorkspaceSurfaceKey, GovernedSurface | UngovernedSurface>> = Object.freeze({
    financials: {
        governed: true,
        basis: "domain_capability",
        label: "Financials",
        readCapabilities: ["fin.read"],
        enforcedBy: "assertFinancialsReadAllowed on every Financials read route",
    },
    inbox: {
        governed: true,
        basis: "domain_capability",
        label: "Inbox",
        readCapabilities: ["communications.read"],
        enforcedBy: "requireCommunicationsAuthority on the communications read routes (threads, unread-count, conversations)",
    },
    analytics: {
        governed: true,
        basis: "domain_capability",
        label: "Analytics",
        // The read helper accepts reports.write as well (routeCapabilities note on intelligence/operational).
        readCapabilities: ["reports.read", "reports.write"],
        enforcedBy: "requireAnalyticsReadAccess on intelligence/operational and analytics render/trend",
    },
    // Portal admission only (no declared domain capability). The key comes from the client-safe
    // `portalAdmissionKey.ts`, the same spelling the server admission module binds, so this client
    // module never imports the server admission module. A test locks the two together.
    tasks: {
        governed: true,
        basis: "portal_admission",
        label: "Tasks",
        readCapabilities: [PORTAL_ADMISSION_CAPABILITY_KEY],
        enforcedBy: "requireAdminOrgContextLight (and loadAdminRouteGate for the per-department summary) on operational-tasks GET",
    },
    processing: {
        governed: true,
        basis: "portal_admission",
        label: "Processing",
        readCapabilities: [PORTAL_ADMISSION_CAPABILITY_KEY],
        enforcedBy: "getAdminContextCached on processing/queue GET and forms GET",
    },
    operations: {
        governed: true,
        basis: "portal_admission",
        label: "Operations",
        readCapabilities: [PORTAL_ADMISSION_CAPABILITY_KEY],
        enforcedBy: "getAdminContextCached on scheduling GET; requireAdminOrOps (light portal context) on records/bootstrap GET",
    },
});

export const WORKSPACE_SURFACE_KEYS = Object.freeze(Object.keys(WORKSPACE_VISIBILITY_SURFACES) as WorkspaceSurfaceKey[]);

export type VisibilityPrincipal = { userId: string; orgId: string };

export type HeldRoleGrants = {
    roleKey: string;
    /** `null` when this role's grants are not known (unknown role, not yet loaded). */
    grantedPermissionKeys: readonly string[] | null;
};

export type RoleGrantBasis =
    /** Each held role with its own grants: per-role provenance. */
    | { kind: "per_role"; roles: readonly HeldRoleGrants[] }
    /** The server-resolved union of the held roles' grants (AdminAuthContext.permissionKeys). */
    | { kind: "resolved_union"; roleKeys: readonly string[]; permissionKeys: readonly string[] };

/** Per-user, per-organization, hide-only. `null` while none is loaded (no store exists yet). */
export type HideOnlyVisibilityOverride = {
    principal: VisibilityPrincipal;
    hiddenSurfaceKeys: readonly string[];
};

export type WorkspaceVisibilityState = "shown" | "hidden_by_role_default" | "hidden_by_override" | "unknown" | "not_governed";

export type WorkspaceSurfaceVisibility = {
    state: WorkspaceVisibilityState;
    /** Held roles (or the resolved union) that grant a read capability; empty when none or unknown. */
    shownBy: readonly string[];
};

export type WorkspaceVisibility = {
    /** The principal this answer belongs to; `null` when the principal was not known. */
    principal: VisibilityPrincipal | null;
    surfaces: Readonly<Record<WorkspaceSurfaceKey, WorkspaceSurfaceVisibility>>;
};

export const RESOLVED_UNION_BASIS_LABEL = "resolved role grants";

function knownPrincipal(p: VisibilityPrincipal | null | undefined): VisibilityPrincipal | null {
    if (!p) return null;
    const userId = typeof p.userId === "string" ? p.userId.trim() : "";
    const orgId = typeof p.orgId === "string" ? p.orgId.trim() : "";
    return userId && orgId ? { userId, orgId } : null;
}

/** The one principal-equality rule: both known (trimmed, non-empty) and identical user + organization. */
export function samePrincipal(a: VisibilityPrincipal | null | undefined, b: VisibilityPrincipal | null | undefined): boolean {
    a = knownPrincipal(a ?? null);
    const k = knownPrincipal(b ?? null);
    return a != null && k != null && a.userId === k.userId && a.orgId === k.orgId;
}

/** Role-default answer for one governed surface. */
function roleDefault(surface: GovernedSurface, grants: RoleGrantBasis | null): WorkspaceSurfaceVisibility {
    if (grants == null) return { state: "unknown", shownBy: [] };
    if (grants.kind === "resolved_union") {
        if (!Array.isArray(grants.permissionKeys)) return { state: "unknown", shownBy: [] };
        const hit = surface.readCapabilities.some((cap) => grants.permissionKeys.includes(cap));
        return hit ? { state: "shown", shownBy: [RESOLVED_UNION_BASIS_LABEL] } : { state: "hidden_by_role_default", shownBy: [] };
    }
    if (!Array.isArray(grants.roles)) return { state: "unknown", shownBy: [] };
    const shownBy: string[] = [];
    let anyUnknown = false;
    for (const role of grants.roles) {
        const roleKey = typeof role?.roleKey === "string" ? role.roleKey.trim() : "";
        if (!roleKey || !Array.isArray(role.grantedPermissionKeys)) {
            anyUnknown = true;
            continue;
        }
        if (surface.readCapabilities.some((cap) => role.grantedPermissionKeys!.includes(cap)) && !shownBy.includes(roleKey)) {
            shownBy.push(roleKey);
        }
    }
    if (shownBy.length) return { state: "shown", shownBy };
    return { state: anyUnknown ? "unknown" : "hidden_by_role_default", shownBy: [] };
}

/**
 * Resolve workspace visibility for one principal. Pure: reads its inputs, mutates nothing, and returns
 * surface states only (no permission keys), so it cannot feed an authorization decision.
 */
export function resolveWorkspaceVisibility(input: {
    principal: VisibilityPrincipal | null | undefined;
    grants: RoleGrantBasis | null | undefined;
    override?: HideOnlyVisibilityOverride | null;
}): WorkspaceVisibility {
    const principal = knownPrincipal(input.principal ?? null);
    const grants = principal ? (input.grants ?? null) : null;
    // An override for any other principal (stale user or organization) is never applied.
    const hidden = new Set(
        input.override && samePrincipal(principal, input.override.principal) && Array.isArray(input.override.hiddenSurfaceKeys)
            ? input.override.hiddenSurfaceKeys
            : [],
    );
    const surfaces = {} as Record<WorkspaceSurfaceKey, WorkspaceSurfaceVisibility>;
    for (const key of WORKSPACE_SURFACE_KEYS) {
        const surface = WORKSPACE_VISIBILITY_SURFACES[key];
        if (!surface.governed) {
            surfaces[key] = { state: hidden.has(key) ? "hidden_by_override" : "not_governed", shownBy: [] };
            continue;
        }
        const base = roleDefault(surface, grants);
        // Hide-only: an override can turn "shown" into hidden, never anything into "shown".
        surfaces[key] = base.state === "shown" && hidden.has(key) ? { state: "hidden_by_override", shownBy: [] } : base;
    }
    return { principal, surfaces: Object.freeze(surfaces) };
}

/**
 * Should the caller render this surface for `current`? A result computed for another principal (stale
 * user or organization) answers `false` for governed surfaces. `not_governed` keeps the caller's
 * existing behaviour (rendered), unless a hide-only override hid it.
 */
export function workspaceSurfaceRendered(
    visibility: WorkspaceVisibility,
    current: VisibilityPrincipal | null | undefined,
    key: WorkspaceSurfaceKey,
): boolean {
    const s = visibility.surfaces[key];
    if (!s) return false;
    if (s.state === "not_governed") return true;
    if (s.state !== "shown") return false;
    return samePrincipal(visibility.principal, current);
}

/** The AdminAuthContext projection the Admin V2 shell supplies (resolved union of held-role grants). */
export function workspaceVisibilityFromAdminAuth(
    auth: { userId: string; orgId: string; roleKeys: readonly string[]; permissionKeys: readonly string[] | null } | null | undefined,
    override: HideOnlyVisibilityOverride | null = null,
): WorkspaceVisibility {
    if (!auth) return resolveWorkspaceVisibility({ principal: null, grants: null, override: null });
    return resolveWorkspaceVisibility({
        principal: { userId: auth.userId, orgId: auth.orgId },
        grants:
            Array.isArray(auth.permissionKeys) ?
                { kind: "resolved_union", roleKeys: auth.roleKeys, permissionKeys: auth.permissionKeys }
            :   null,
        // Hide-only, and ignored unless it names this same principal.
        override,
    });
}
