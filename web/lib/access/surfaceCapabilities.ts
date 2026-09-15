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

import {
    ADMIN_ACCESS_SCOPE_WRITE,
    ADMIN_ROLES_READ,
    ADMIN_ROLES_WRITE,
    ADMIN_USERS_READ,
    ADMIN_USERS_WRITE,
} from "@/lib/admin/canManageUsersAndRoles";
import { hasPortalAdminMutateAccess } from "@/lib/admin/adminPortalRolePick";
import type { AdminAccessContextSuccess } from "@/lib/admin/getAdminAccessContext";
import {
    ACCESS_WORKSPACE_CHAPTERS,
    ACCESS_WORKSPACE_CHAPTER_META,
    accessWorkspaceChapterHref,
    type AccessCommandKey,
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
    /**
     * Capabilities a chapter's CONTROLS require, beyond the one that admits the chapter.
     *
     * Empty until the four-authority split. While `settings.users_roles` admitted the workspace,
     * admission and command authority were one key, so a surface's backing routes all required
     * exactly what admitted it and this field would have been meaningless. They are now different
     * questions: Users is admitted by `admin.users.read`, and the invite control behind it requires
     * `admin.users.write`, which a read-only user administrator does not hold.
     *
     * Listing a capability here is a claim with an enforcement obligation, not a waiver: it says the
     * surface WITHDRAWS the control when the capability is absent, and the tier A join checks the
     * withdrawal is real by resolving it through {@link availableAccessCommands} rather than taking
     * this list's word for it.
     */
    commandCapabilities?: readonly string[];
};

/**
 * The three Access chapters, each admitted by the READ authority over what it shows.
 *
 * They used to share one capability, because one capability is what the platform had: a chapter was
 * admitted by `settings.users_roles` and so was every command inside it. The split gives each
 * chapter the narrowest key that makes its content meaningful — you are admitted to Users if you may
 * see people, to Roles if you may see roles — and moves the authority to CHANGE anything into
 * `commandCapabilities`, where it is withdrawn control by control.
 *
 * Admission is deliberately the read key and not the write key. Gating the chapter on write would
 * hide the roster from an auditor who is entitled to read it, which is a narrowing no decision
 * authorized; gating it on write would also make `admin.users.read` a key that grants nothing
 * reachable, which is the dead-capability shape `IA-R6` forbids.
 */
export const ACCESS_SURFACE_DECLARATIONS: Record<AccessWorkspaceChapter, SurfaceCapabilityDeclaration> = {
    users: {
        surfaceKey: "access:users",
        label: ACCESS_WORKSPACE_CHAPTER_META.users.label,
        href: accessWorkspaceChapterHref("users"),
        capability: ADMIN_USERS_READ,
        commandCapabilities: [ADMIN_USERS_WRITE, ADMIN_ACCESS_SCOPE_WRITE, ADMIN_ROLES_READ],
        backingRoutes: [
            "app/api/admin/settings/users-roles/members/route.ts",
            "app/api/admin/users/route.ts",
            "app/api/admin/users/[userId]/role/route.ts",
            "app/api/admin/users/[userId]/access-scope/route.ts",
            "app/api/admin/users/[userId]/remove/route.ts",
            // GET ONLY — the picker reads the role list. Creating a role is the Roles chapter's
            // command, under `admin.roles.write`, and this chapter draws no control for it.
            "app/api/admin/rbac/roles/route.ts#GET",
            // OD-8 — the chapter explains effective access, so it reads the capability catalog and
            // each held role's grants. Both are READS feeding an explanation; the Users chapter
            // offers no capability editing, which stays in the role editor (`W-59`/`RM-6`).
            "app/api/admin/rbac/permissions/route.ts",
            "app/api/admin/rbac/grants/route.ts#GET",
            // D2 — the chapter renders the shared Access history card, which reads this route. It
            // enforces `admin.users.read`, the same key that admits this chapter, so the surface
            // gate and the route gate are true for the same reason.
            "app/api/admin/access/history/route.ts",
        ],
        divergentRoutes: [
            {
                // W49-F1. The route enforces `ctx.role !== "admin"` and is `pending` in W-14's
                // table, while the chapter around it is admitted by `settings.users_roles`. The
                // divergence is REAL AND UNCHANGED — this entry is not a to-do that has been done.
                //
                // What has changed is that the surface no longer *promises* the command to
                // principals the route refuses: `availableAccessCommands` resolves it from the
                // route's own predicate and the control is withdrawn when that predicate says no.
                // Reconciling the route itself means declaring it `settings.users_roles`, which is
                // a one-line WIDENING of who may trigger a password-reset email — W-15's sweep to
                // make with a product decision behind it, not a presentation workstream's.
                route: "app/api/admin/send-password-reset/route.ts",
                reason: "W49-F1 — enforces role `admin`, declared `pending`; presentation now agrees, the route's own declaration is W-15 + AD",
            },
        ],
    },
    roles: {
        surfaceKey: "access:roles",
        label: ACCESS_WORKSPACE_CHAPTER_META.roles.label,
        href: accessWorkspaceChapterHref("roles"),
        capability: ADMIN_ROLES_READ,
        commandCapabilities: [ADMIN_ROLES_WRITE, ADMIN_USERS_READ],
        backingRoutes: [
            "app/api/admin/rbac/roles/route.ts",
            "app/api/admin/rbac/roles/[role_key]/route.ts",
            "app/api/admin/rbac/permissions/route.ts",
            "app/api/admin/rbac/grants/route.ts",
            "app/api/admin/settings/users-roles/members/route.ts",
            // D2 — the chapter renders the shared Access history card, which reads this route. It
            // enforces the same `settings.users_roles` the chapter is admitted by, so the surface
            // gate and the route gate are true for the same reason.
            "app/api/admin/access/history/route.ts",
        ],
    },
    security: {
        surfaceKey: "access:security",
        label: ACCESS_WORKSPACE_CHAPTER_META.security.label,
        href: accessWorkspaceChapterHref("security"),
        capability: ADMIN_USERS_READ,
        // D2 — the chapter issues its first request. The Audit Log card said `Planned` since it was
        // written and now renders committed `mutation_events`, so the honest declaration is the route
        // it reads rather than the note explaining that it read nothing.
        //
        // The route enforces `settings.users_roles`, which is this chapter's own declared capability:
        // reading who changed access requires the authority to change it, so admission and the
        // backing route are true for the same reason — which is what `05…§7.7` asks of a surface.
        backingRoutes: ["app/api/admin/access/history/route.ts"],
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
    /*
     * STILL NO SECOND PREDICATE — it is just that there are five keys to report now instead of one.
     *
     * The old body called `canManageUsersAndRoles` and reported the single umbrella key it decided.
     * That function survives as the CHAPTER-LEVEL gate for `/organization/access` (any Access
     * authority opens the workspace), but it can no longer answer *which* chapters or *which*
     * controls, because those are five different questions now. The membership test below is the
     * same one `requireAccessAdministration` applies on every route: the key is in the set iff the
     * principal holds it, with no role literal and no inference between keys.
     */
    const held = new Set<string>();
    for (const key of ACCESS_ADMINISTRATION_SURFACE_KEYS) {
        if (access.permissionKeys.includes(key)) held.add(key);
    }
    return held;
}

/** Every key the Access surfaces admit or command on. Declared once, so the two cannot drift. */
const ACCESS_ADMINISTRATION_SURFACE_KEYS: readonly string[] = Object.freeze([
    ADMIN_USERS_READ,
    ADMIN_USERS_WRITE,
    ADMIN_ROLES_READ,
    ADMIN_ROLES_WRITE,
    ADMIN_ACCESS_SCOPE_WRITE,
]);

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

/* ------------------------------------------------------------------ */
/* W49-F1 — commands whose gate is not the surface's gate              */
/* ------------------------------------------------------------------ */

/**
 * **W49-F1.** A chapter is admitted as a whole, but not every control inside it is enforced by the
 * capability that admitted the chapter. `Send password reset` was rendered to every holder of
 * `settings.users_roles`, while `app/api/admin/send-password-reset/route.ts` enforces the portal
 * `admin` role — so a grant-holder who is not org `admin` was shown the control and got a 403.
 * `T-6` names the general shape *revocation theatre*; this is its inverse, a control that was never
 * live for the person being offered it.
 *
 * **Why this is the fix and a route declaration is not.** Declaring the route
 * `settings.users_roles` would reconcile the two by *widening* who may trigger a password-reset
 * email — a product decision belonging to `W-15`, not something a presentation workstream may slip
 * in. Withdrawing the control changes no authorization at all: the route enforces exactly what it
 * enforced before, and a principal who could never have used this control simply stops being
 * offered it. That is the platform rule in its intended direction — *presentation reflects
 * authorization; presentation does not create authorization.*
 *
 * **This is not the `canManage` prop `W-49` deleted.** That prop was a boolean the client consulted
 * to decide whether to draw an apology *inside* a surface it had already been admitted to — an
 * authorization decision wearing a display prop's clothes. {@link AccessCommandKey} is the same
 * shape as `chapters`: a list of *already-enforced results* computed on the server, carrying no
 * decision the client could get wrong. Dropping it entirely would hide a control, never expose one.
 *
 * The {@link AccessCommandKey} vocabulary lives in `accessChapterRoutes` because the components that
 * carry it are client modules and this one is not; the *resolver* is here, with the other gates.
 */

/**
 * Evaluated by calling the predicate the route's own context is derived from.
 *
 * `getAdminContext` builds `ctx.role` via `compatibilityPortalRole(roleKeys)`, which returns
 * `"admin"` exactly when {@link hasPortalAdminMutateAccess} does. So `ctx.role !== "admin"` and this
 * function are one predicate read two ways, not two predicates that presently agree — which is what
 * `05…§7.7`'s *"true for the same reason"* requires, and what stops the drift `L8` warns about.
 */
export function availableAccessCommands(
    access: Pick<AdminAccessContextSuccess, "roleKeys" | "permissionKeys">
): AccessCommandKey[] {
    const commands: AccessCommandKey[] = [];
    if (hasPortalAdminMutateAccess(access.roleKeys)) commands.push("password-reset");
    /*
     * Each of the three below is resolved by the MEMBERSHIP TEST ITS ROUTE APPLIES — the body of
     * `requireAccessAdministration` is `access.permissionKeys.includes(capability)`, and so is this.
     * A control is therefore drawn exactly when the route behind it would accept the click, which is
     * the direction W49-F1 requires: presentation reflects authorization, never creates it.
     *
     * Withdrawing a control is not an authorization decision and cannot become one — a principal who
     * is not offered the invite control and posts to the route anyway still meets the 403.
     */
    if (access.permissionKeys.includes(ADMIN_USERS_WRITE)) commands.push("manage-users");
    if (access.permissionKeys.includes(ADMIN_ACCESS_SCOPE_WRITE)) commands.push("manage-access-scope");
    if (access.permissionKeys.includes(ADMIN_ROLES_WRITE)) commands.push("manage-roles");
    return commands;
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
/*
 * ANY-OF, NOT ONE KEY — and the change is forced by the split, not a loosening.
 *
 * This was `Record<string, string>`: one domain, one capability, because the Access page was one
 * capability. It now has three chapter capabilities, and a role administrator holding only
 * `admin.roles.read` is admitted to the workspace and to the Roles chapter. Pinning the card to a
 * single key — `admin.users.read`, say — would draw no Access card for that person while
 * `/organization/access` opened for them at the URL. That is `W49-F2`'s defect exactly, in the
 * direction that hurts: navigation hiding a surface admission grants.
 *
 * So the card is visible when the principal holds ANY of the domain's capabilities, and the list is
 * DERIVED from the chapter declarations rather than restated beside them — the card cannot gate on a
 * key the page does not, because it is reading the page's own answer.
 */
export const ORGANIZATION_DOMAIN_CAPABILITIES: Readonly<Record<string, readonly string[]>> = {
    access: Object.freeze(ACCESS_SURFACE_LIST.map((d) => d.capability).filter((c, i, a) => a.indexOf(c) === i)),
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
    const capabilities = ORGANIZATION_DOMAIN_CAPABILITIES[domainKey];
    if (!capabilities) return true;
    return capabilities.some((capability) => heldCapabilities.has(capability));
}
