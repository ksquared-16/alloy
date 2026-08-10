/**
 * W-49 — a surface declares the capability it presents, and it is `W-14`'s capability.
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §21.
 *
 * `05…§1`/`§3.3`: **1 of 132 admin pages is gated on anything finer than "has a role"**, and that
 * one is *a display prop, not an access decision*. `05…§7.7` states the remedy — *"let each
 * surface declare the capability it presents, have the layout enforce it, and have navigation
 * **filter from the same declaration** — so that 'blocked from seeing the Billing workspace'
 * becomes true, and true for the same reason the billing commands are blocked."*
 *
 * **"For the same reason" is the whole design, and it is checkable.** The capability named here
 * must be one the routes behind the surface declare in `scripts/routeCapabilities.declared.json`.
 * A surface gating on a capability its own API does not require would be a second, divergent
 * authorization model wearing the first one's vocabulary — which is `C11` in a new place. The
 * join is `web/tests/access/surfaceCapabilityDeclaration.test.ts`, and it fails the build through
 * the same path `RL-10` does.
 *
 * **This file declares; it does not decide.** The predicate is `canManageUsersAndRoles`, the same
 * function the backing routes call. Declaring a capability and then re-implementing its evaluation
 * here would reintroduce exactly the divergence the declaration exists to prevent — and, because
 * `L8` compounds with `L7`, a subtly different predicate on the Access surface is the one that
 * locks an operator out of the screen they would use to fix it.
 *
 * **Server-only.** `canManageUsersAndRoles` is a server module (`next/server`). The client surface
 * receives the *result* — a chapter list — as a plain prop, so the declaration never has to be
 * evaluated a second time in the browser to decide what to draw.
 */

import { canManageUsersAndRoles, SETTINGS_USERS_ROLES_PERMISSION } from "@/lib/admin/canManageUsersAndRoles";
import type { AdminAccessContextSuccess } from "@/lib/admin/getAdminAccessContext";
import {
    ACCESS_WORKSPACE_CHAPTERS,
    ACCESS_WORKSPACE_CHAPTER_META,
    accessWorkspaceChapterHref,
    type AccessWorkspaceChapter,
} from "@/lib/access/accessChapterRoutes";

export type SurfaceCapabilityDeclaration = {
    /**
     * Stable identity for the surface — a chapter of the Access workspace.
     *
     * **`access:users`, not `access.users`.** A dotted lowercase literal *is* the permission-key
     * grammar (`tests/access/permissionCatalogDiscovery.ts`), so a surface key written that way is
     * indistinguishable from a capability the platform enforces — `W-11`'s reconciliation reads it
     * as an enforced key with no catalog row, which is how a vocabulary quietly acquires four
     * members nobody seeded. Surface identity and capability are different namespaces, and the
     * separator says so.
     */
    surfaceKey: string;
    label: string;
    href: string;
    /** The capability this surface presents. Must be a seeded catalog key. */
    capability: string;
    /**
     * Route files, keyed exactly as `routeCapabilities.declared.json` keys them, that this surface
     * reads or writes AND that declare {@link SurfaceCapabilityDeclaration.capability}. At least
     * one must exist — that join is what makes the surface gate and the command gate the same gate.
     */
    backingRoutes: string[];
    /**
     * Routes this surface calls whose declared capability is **not** this surface's — a known,
     * named divergence rather than an omission. The tier A check asserts each of these still
     * diverges, so repairing a route forces it out of this list: the list ratchets down and can
     * never quietly grow stale. Listing a route here is not permission for the divergence; it is
     * the record that the divergence is known and unfixed.
     */
    divergentRoutes?: { route: string; reason: string }[];
    /**
     * Set only when the surface calls no route at all. A surface that presents no command still
     * needs a gate (it is a chapter of a gated workspace), but it cannot satisfy the join, and
     * inventing a backing route to satisfy it would be the fabrication the join exists to catch.
     */
    noBackingRoutesReason?: string;
};

/**
 * The four Access chapters. All four present `settings.users_roles`, because the workspace is one
 * gate; what differs is whether a chapter can *prove* it through a route of its own.
 */
export const ACCESS_SURFACE_DECLARATIONS: Record<AccessWorkspaceChapter, SurfaceCapabilityDeclaration> = {
    users: {
        surfaceKey: "access:users",
        label: ACCESS_WORKSPACE_CHAPTER_META.users.label,
        href: accessWorkspaceChapterHref("users"),
        capability: SETTINGS_USERS_ROLES_PERMISSION,
        backingRoutes: [
            "app/api/admin/settings/users-roles/members/route.ts",
            "app/api/admin/users/[userId]/role/route.ts",
            "app/api/admin/users/[userId]/access-scope/route.ts",
        ],
        divergentRoutes: [
            {
                // W49-F1. The Users chapter renders "Send password reset" to every holder of
                // `settings.users_roles` (AccessUsersConfigurationPage.tsx:338), but the route
                // enforces `ctx.role !== "admin"` and is `pending` in W-14's table. A grant-holder
                // who is not org `admin` is shown the control and gets 403 — `T-6`'s revocation
                // theatre in its inverse form. Declaring it `settings.users_roles` here would be a
                // one-line WIDENING of who may trigger a password-reset email; that is W-15's
                // sweep to make with a product decision behind it, not W-49's to slip in under a
                // presentation workstream.
                route: "app/api/admin/send-password-reset/route.ts",
                reason: "W49-F1 — enforces role `admin`, declared `pending`; narrowing/widening is W-15 + AD",
            },
        ],
    },
    roles: {
        surfaceKey: "access:roles",
        label: ACCESS_WORKSPACE_CHAPTER_META.roles.label,
        href: accessWorkspaceChapterHref("roles"),
        capability: SETTINGS_USERS_ROLES_PERMISSION,
        backingRoutes: [
            "app/api/admin/rbac/roles/route.ts",
            "app/api/admin/settings/users-roles/members/route.ts",
        ],
    },
    scopes: {
        surfaceKey: "access:scopes",
        label: ACCESS_WORKSPACE_CHAPTER_META.scopes.label,
        href: accessWorkspaceChapterHref("scopes"),
        capability: SETTINGS_USERS_ROLES_PERMISSION,
        // The Scopes chapter reads the location/department catalogue from the members route rather
        // than from a route of its own.
        backingRoutes: ["app/api/admin/settings/users-roles/members/route.ts"],
    },
    security: {
        surfaceKey: "access:security",
        label: ACCESS_WORKSPACE_CHAPTER_META.security.label,
        href: accessWorkspaceChapterHref("security"),
        capability: SETTINGS_USERS_ROLES_PERMISSION,
        backingRoutes: [],
        // Every row in this chapter is `Planned` except the Password line, and the one live
        // password-reset command lives on the Users chapter. The chapter issues no request. It is
        // still gated, because it is a chapter of a gated workspace — but it has nothing to join
        // against, and saying so is more honest than borrowing another chapter's route.
        noBackingRoutesReason:
            "Chapter is entirely static posture (all rows Planned); the live reset command is on the Users chapter",
    },
};

export const ACCESS_SURFACE_LIST: SurfaceCapabilityDeclaration[] = ACCESS_WORKSPACE_CHAPTERS.map(
    (chapter) => ACCESS_SURFACE_DECLARATIONS[chapter]
);

/**
 * The capabilities this principal holds, among those the Access surfaces declare.
 *
 * Evaluated by **calling the gate the routes call**. There is deliberately no second predicate
 * here: a capability is in the set iff its own enforcing function says so.
 */
export function heldAccessCapabilities(
    access: Pick<AdminAccessContextSuccess, "roleKeys" | "permissionKeys">
): ReadonlySet<string> {
    const held = new Set<string>();
    if (canManageUsersAndRoles(access)) held.add(SETTINGS_USERS_ROLES_PERMISSION);
    return held;
}

/**
 * Navigation filters from the declaration — the same one the layout enforces.
 *
 * @param heldCapabilities - the principal's capability set, from {@link heldAccessCapabilities}.
 *   Passing a set computed a second way is how "hidden but reachable" happens.
 */
export function visibleAccessChapters(
    heldCapabilities: ReadonlySet<string>
): AccessWorkspaceChapter[] {
    return ACCESS_WORKSPACE_CHAPTERS.filter((chapter) =>
        heldCapabilities.has(ACCESS_SURFACE_DECLARATIONS[chapter].capability)
    );
}

/**
 * **W49-F2 — the workspace above the workspace.**
 *
 * Gating `/organization/access` closed the URL, but `/organization` still drew an Access domain
 * card, with a link, to a principal the page now redirects. That is the same defect one level out:
 * navigation offering what admission refuses. `05…§7.7` is explicit that navigation must filter
 * *from the same declaration*, so this reads {@link ACCESS_SURFACE_DECLARATIONS}' capability rather
 * than naming `settings.users_roles` a third time.
 *
 * **Only `access` is declared, and that is the honest state, not an oversight.** The other ten
 * organization domains are the residue of `05…§1`'s *"1 of 132 admin pages"* — no capability is
 * enforced behind them, so there is nothing to filter on, and inventing one here would be the
 * fabricated gate `W-50` exists to catch. They stay visible until `W-15`'s sweep gives them a
 * capability to be visible *for*. An undeclared domain is unfiltered **and says so** — the tier A
 * check asserts this map covers exactly the declared set, so a domain that acquires a capability
 * without acquiring a filter is a failure rather than a silent pass.
 */
export const ORGANIZATION_DOMAIN_CAPABILITIES: Readonly<Record<string, string>> = {
    access: SETTINGS_USERS_ROLES_PERMISSION,
};

/**
 * Does this principal see the `/organization` card for `domainKey`?
 *
 * @param heldCapabilities - from {@link heldAccessCapabilities}, so the card and the page it links
 *   to are decided by one evaluation of one predicate.
 */
export function isOrganizationDomainVisible(
    domainKey: string,
    heldCapabilities: ReadonlySet<string>
): boolean {
    const capability = ORGANIZATION_DOMAIN_CAPABILITIES[domainKey];
    if (!capability) return true;
    return heldCapabilities.has(capability);
}
