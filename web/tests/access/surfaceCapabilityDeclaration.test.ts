/**
 * W-49 / RL-36 (tier A, discovered subject) — a surface declares the capability it presents, that
 * capability is `W-14`'s, and every page rendering the surface gates on it at the boundary.
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §21.
 *
 * `05…§7.7` asks for three things that must be *one* thing: the surface declares, the layout
 * enforces, and navigation filters — *"from the same declaration"*. Three separately-correct
 * mechanisms are the failure this workstream exists to prevent, so each property below is written
 * as a join rather than as an independent assertion:
 *
 *   1. The declared capability is a key the migration tree actually seeds (join → catalog).
 *   2. Each surface's backing routes declare that same capability in `W-14`'s table (join → routes).
 *      This is the whole content of *"true for the same reason the billing commands are blocked."*
 *   3. Every page that renders the surface is discovered **from disk** and must gate and filter.
 *      `RL-1`, `RL-4` and `RL-11` were each defeated by an enumerated subject. A page added
 *      tomorrow is a violation tomorrow, not at the next audit.
 *   4. The filter is not vacuous: a principal holding nothing sees no chapter.
 *   5. Known divergences are named and must *stay* divergent — repairing a route forces it out of
 *      `divergentRoutes`, so the list can only shrink. A record that can go stale silently is the
 *      same class of instrument as a census that always passes (`§10.2`).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
    ACCESS_SURFACE_DECLARATIONS,
    ACCESS_SURFACE_LIST,
    ORGANIZATION_DOMAIN_CAPABILITIES,
    isOrganizationDomainVisible,
    visibleAccessChapters,
    heldAccessCapabilities,
    availableAccessCommands,
} from "@/lib/access/surfaceCapabilities";
import { organizationConfigurationDomains } from "@/lib/configRuntime/organizationRuntime";
import { ACCESS_WORKSPACE_CHAPTERS } from "@/lib/access/accessChapterRoutes";
import { buildAccessLandingModel } from "@/lib/configRuntime/accessLandingModel";
import { SETTINGS_USERS_ROLES_PERMISSION } from "@/lib/admin/canManageUsersAndRoles";
import { discoverCatalog, PERMISSION_KEY_GRAMMAR, REPO_ROOT } from "./permissionCatalogDiscovery";

type Declaration =
    | { status: "declared"; capability: string; helper?: string; note?: string }
    | { status: "none"; reason: string }
    | { status: "pending"; note?: string };

const declaredTable = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, "web/scripts/routeCapabilities.declared.json"), "utf8")
) as { routes: Record<string, Record<string, Declaration>> };

/** Capabilities a route declares on any of its exported methods. */
function capabilitiesDeclaredBy(route: string): Set<string> {
    const methods = declaredTable.routes[route];
    const out = new Set<string>();
    for (const decl of Object.values(methods ?? {})) {
        if (decl.status === "declared") out.add(decl.capability);
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* The discovered subject: every page that renders the Access surface  */
/* ------------------------------------------------------------------ */

const SURFACE_ENTRYPOINTS = ["AccessWorkspaceSurface", "UsersRolesConfigurationPage"];

function walkPages(dir: string, out: string[] = []): string[] {
    if (!fs.existsSync(dir)) return out;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name === ".next") continue;
            walkPages(full, out);
        } else if (entry.name === "page.tsx") {
            out.push(full);
        }
    }
    return out;
}

/** Discovered from disk, never listed: pages that render the Access workspace. */
const renderingPages = walkPages(path.join(REPO_ROOT, "web/app"))
    .filter((file) => {
        const source = fs.readFileSync(file, "utf8");
        return SURFACE_ENTRYPOINTS.some((name) => source.includes(name));
    })
    .map((file) => path.relative(path.join(REPO_ROOT, "web"), file))
    .sort();

const readWeb = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, "web", rel), "utf8");

/**
 * Executable lines only. These files carry long comments explaining *why* the removed prop is
 * removed, and a substring check that cannot tell code from prose would forbid saying so — the
 * lock would be enforcing silence rather than behaviour.
 */
const readWebCode = (rel: string) =>
    readWeb(rel)
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

describe("W-49 · RL-36 — the surface capability declaration", () => {
    it("declares every Access chapter, once, with a stable key and its canonical href", () => {
        expect(ACCESS_SURFACE_LIST).toHaveLength(ACCESS_WORKSPACE_CHAPTERS.length);
        const keys = ACCESS_SURFACE_LIST.map((d) => d.surfaceKey);
        expect(new Set(keys).size).toBe(keys.length);
        for (const chapter of ACCESS_WORKSPACE_CHAPTERS) {
            const decl = ACCESS_SURFACE_DECLARATIONS[chapter];
            // `:`, not `.` — a dotted key is the permission-key grammar, and a surface identity
            // written in it reads to W-11's reconciliation as an enforced key nobody seeded.
            expect(decl.surfaceKey).toBe(`access:${chapter}`);
            expect(decl.surfaceKey).not.toMatch(PERMISSION_KEY_GRAMMAR);
            expect(decl.href).toContain(`section=${chapter}`);
            expect(decl.label.length).toBeGreaterThan(0);
        }
    });

    it("declares only capabilities the migration tree seeds", () => {
        const catalog = discoverCatalog();
        // Non-vacuity: a discovery that returned nothing would pass every membership test below.
        expect(catalog.size).toBeGreaterThan(20);
        for (const decl of ACCESS_SURFACE_LIST) {
            expect(
                catalog.has(decl.capability),
                `${decl.surfaceKey} declares ${decl.capability}, which no migration seeds`
            ).toBe(true);
        }
    });

    it("joins each surface to W-14's table: a backing route declares the surface's own capability", () => {
        for (const decl of ACCESS_SURFACE_LIST) {
            for (const route of decl.backingRoutes) {
                expect(
                    declaredTable.routes[route],
                    `${decl.surfaceKey} names ${route}, which is not in the declared route table`
                ).toBeDefined();
                expect(
                    capabilitiesDeclaredBy(route).has(decl.capability),
                    `${decl.surfaceKey} gates on ${decl.capability}, but its backing route ${route} does not declare it — ` +
                        "a surface gate and a command gate that are not the same gate"
                ).toBe(true);
            }
        }
    });

    it("requires a backing route, or an explicit reason there is none", () => {
        for (const decl of ACCESS_SURFACE_LIST) {
            const hasRoutes = decl.backingRoutes.length > 0;
            expect(
                hasRoutes || Boolean(decl.noBackingRoutesReason),
                `${decl.surfaceKey} has no backing route and no reason recorded`
            ).toBe(true);
            // A reason and routes together would let a surface keep the excuse after it grew a
            // command — the exemption must expire when the condition that justified it does.
            expect(hasRoutes && Boolean(decl.noBackingRoutesReason)).toBe(false);
        }
    });

    it("ratchets known divergences: a route named as divergent must still diverge", () => {
        for (const decl of ACCESS_SURFACE_LIST) {
            for (const { route, reason } of decl.divergentRoutes ?? []) {
                expect(reason.length).toBeGreaterThan(20);
                expect(
                    declaredTable.routes[route],
                    `${decl.surfaceKey} names divergent route ${route}, which is not in the declared route table`
                ).toBeDefined();
                expect(
                    decl.backingRoutes,
                    `${route} is listed as both backing and divergent for ${decl.surfaceKey}`
                ).not.toContain(route);
                expect(
                    capabilitiesDeclaredBy(route).has(decl.capability),
                    `${route} now declares ${decl.capability} — the divergence is repaired, so move it ` +
                        `from divergentRoutes to backingRoutes on ${decl.surfaceKey}`
                ).toBe(false);
            }
        }
    });

    /**
     * W49-F1, pinned so it cannot be quietly resolved by widening. The Users chapter renders
     * "Send password reset" to any holder of `settings.users_roles`; the route requires org
     * `admin`. Whichever way that is reconciled is a W-15 decision, and this assertion is what
     * makes the reconciliation visible when it happens.
     */
    it("records W49-F1 — send-password-reset still enforces a role, not the capability", () => {
        const route = "app/api/admin/send-password-reset/route.ts";
        expect(ACCESS_SURFACE_DECLARATIONS.users.divergentRoutes?.map((d) => d.route)).toContain(route);
        expect(readWeb("components/adminV2/settings/access/AccessUsersConfigurationPage.tsx")).toContain(
            "/api/admin/send-password-reset"
        );
        // The divergence itself is UNCHANGED and must stay recorded: reconciling it means deciding
        // whether a grant-holder may trigger a reset email, which is W-15's call with an AD behind
        // it. What W49-F1 closed is the *presentation* half.
        expect(readWeb(route)).toContain('ctx.role !== "admin"');
    });

    /**
     * W49-F1, closed on the presentation side. The chapter used to draw `Send password reset` for
     * every holder of `settings.users_roles` and let the route answer 403 on click.
     */
    it("offers the reset control only where the route's own predicate admits it", () => {
        // Resolved from `hasPortalAdminMutateAccess`, which is what `compatibilityPortalRole` — and
        // therefore the route's `ctx.role === "admin"` — reduces to. One predicate, read twice.
        expect(availableAccessCommands({ roleKeys: ["admin"] })).toEqual(["password-reset"]);
        // The population W49-F1 is about: holds the surface capability, is not org admin.
        expect(availableAccessCommands({ roleKeys: ["ops"] })).toEqual([]);
        expect(availableAccessCommands({ roleKeys: [] })).toEqual([]);
        // A multi-role membership still resolves by union — IA-7's subject, asserted here so the
        // command gate cannot regress to reading a single "primary" role.
        expect(availableAccessCommands({ roleKeys: ["ops", "admin"] })).toEqual(["password-reset"]);

        // The control is conditional on that resolved list, and the prop is required the whole way
        // down. A default anywhere on this path restores "draw it for everyone, 403 on click".
        const chapter = readWeb("components/adminV2/settings/access/AccessUsersConfigurationPage.tsx");
        expect(chapter).toContain('commands.includes("password-reset")');
        expect(chapter).toContain("{canSendPasswordReset ?");
        for (const rel of [
            "components/adminV2/settings/access/AccessUsersConfigurationPage.tsx",
            "components/adminV2/settings/access/AccessWorkspaceSurface.tsx",
            "components/adminV2/settings/usersRoles/UsersRolesConfigurationPage.tsx",
        ]) {
            expect(readWeb(rel), rel).toMatch(/commands: readonly AccessCommandKey\[\]/);
            expect(readWeb(rel), `${rel} defaults the command list`).not.toMatch(/commands\s*=\s*\[/);
        }
        // The page resolves it at the boundary, beside the chapter filter.
        expect(readWeb(renderingPages[0]!)).toContain("availableAccessCommands(access)");
    });

    /**
     * The client components are `"use client"`; the resolver's module reaches `next/server` through
     * `canManageUsersAndRoles`. The type they share therefore lives in the client-safe module, and
     * a value import from the server one would be a runtime failure this catches first.
     */
    it("keeps the command vocabulary out of the server-only module for client consumers", () => {
        for (const rel of [
            "components/adminV2/settings/access/AccessUsersConfigurationPage.tsx",
            "components/adminV2/settings/access/AccessWorkspaceSurface.tsx",
            "components/adminV2/settings/usersRoles/UsersRolesConfigurationPage.tsx",
        ]) {
            expect(readWeb(rel), rel).not.toContain("lib/access/surfaceCapabilities");
        }
        expect(readWeb("lib/access/accessChapterRoutes.ts")).toContain("export type AccessCommandKey");
        // And the resolver stays where the other gates are, importing the vocabulary rather than
        // re-declaring it — two declarations of one union is how they drift.
        expect(readWeb("lib/access/surfaceCapabilities.ts")).toContain("type AccessCommandKey,");
        expect(readWeb("lib/access/surfaceCapabilities.ts")).not.toContain("export type AccessCommandKey");
    });
});

describe("W-49 · L8 — navigation filters from the declaration", () => {
    it("shows every chapter to a principal holding the declared capability", () => {
        expect(visibleAccessChapters(new Set([SETTINGS_USERS_ROLES_PERMISSION]))).toEqual([
            ...ACCESS_WORKSPACE_CHAPTERS,
        ]);
    });

    it("filters the landing tiles from the same list, and the ids join exactly", () => {
        // The filter drops tiles by id. If a tile id were not a chapter it would vanish from every
        // landing and nothing would report it — so the join is asserted, not assumed.
        const full = buildAccessLandingModel(ACCESS_WORKSPACE_CHAPTERS);
        expect(full.tiles.map((t) => t.id).sort()).toEqual([...ACCESS_WORKSPACE_CHAPTERS].sort());
        for (const chapter of ACCESS_WORKSPACE_CHAPTERS) {
            expect(buildAccessLandingModel([chapter]).tiles.map((t) => t.id)).toEqual([chapter]);
        }
        expect(buildAccessLandingModel(visibleAccessChapters(new Set())).tiles).toEqual([]);
    });

    it("is not vacuous — a principal holding nothing sees no chapter", () => {
        expect(visibleAccessChapters(new Set())).toEqual([]);
        expect(visibleAccessChapters(new Set(["some.unrelated.capability"]))).toEqual([]);
    });

    it("derives held capabilities by calling the routes' own gate, not a second predicate", () => {
        expect(
            heldAccessCapabilities({ roleKeys: ["admin"], permissionKeys: [SETTINGS_USERS_ROLES_PERMISSION] })
        ).toEqual(new Set([SETTINGS_USERS_ROLES_PERMISSION]));
        // W-13/AD-22 — and the role string alone derives nothing. Before the fifth layer was removed
        // this case read `roleKeys: ["admin"], permissionKeys: []` and expected the capability, which
        // is the surface agreeing with a literal rather than with the catalog.
        expect(heldAccessCapabilities({ roleKeys: ["admin"], permissionKeys: [] })).toEqual(new Set());
        expect(
            heldAccessCapabilities({ roleKeys: ["ops"], permissionKeys: [SETTINGS_USERS_ROLES_PERMISSION] })
        ).toEqual(new Set([SETTINGS_USERS_ROLES_PERMISSION]));
        // `ops` is portal-eligible and was previously admitted to this surface. It is the whole
        // population L8 changes, and it must hold nothing here.
        expect(heldAccessCapabilities({ roleKeys: ["ops"], permissionKeys: [] })).toEqual(new Set());
    });
});

/**
 * The page-level properties, expressed once so they can be run against a *fixture* as well as
 * against the repository. `§10.2` exists because a census that always passed was mistaken for
 * verification for two phases; asserting the two real pages are clean proves nothing until the
 * same function is shown to convict a page that is not.
 */
function admissionViolations(source: string): string[] {
    const problems: string[] = [];
    const gateAt = source.indexOf("canManageUsersAndRoles(access)");
    // The *call*, not the import — the import sits at the top of every file and would make this
    // ordering check pass or fail for a reason that has nothing to do with it.
    const sectionAt = source.indexOf("normalizeAccessWorkspaceChapter(");
    if (gateAt < 0) problems.push("does not call the declared capability's gate");
    if (sectionAt >= 0 && gateAt >= 0 && gateAt > sectionAt) {
        problems.push("resolves the section before gating — a chapter is reachable while the refusal is pending");
    }
    if (!source.includes('redirect("/unauthorized")')) problems.push("does not refuse at the boundary");
    if (!source.includes("visibleAccessChapters(heldAccessCapabilities(access))")) {
        problems.push("does not filter chapters from the declaration");
    }
    if (!/!chapters\.includes\(section\)/.test(source)) {
        problems.push("accepts a ?section= the filter excluded — hidden, but reachable by URL");
    }
    return problems;
}

describe("W-49 · AE-4 — the surface is not reachable by URL without the capability", () => {
    it("discovers the pages rendering the surface from disk — and there is now exactly one", () => {
        // IA-8, closed. There were two live rendering routes for one workspace; the duplicate at
        // `app/adminV2/settings/users-roles/page.tsx` is deleted. Two renderers meant two places a
        // gate had to be repeated identically, which is the shape W-49 had to fix twice in one
        // commit. The count is asserted, not the mere presence of the canonical page, so a second
        // renderer reappearing is a failure rather than a silent return to the old state.
        expect(renderingPages).toEqual(["app/adminV2/settings/organization/access/page.tsx"]);
    });

    it("gates and filters on every discovered page", () => {
        for (const rel of renderingPages) {
            expect(admissionViolations(readWeb(rel)), rel).toEqual([]);
        }
    });

    it("is not vacuous — each clause convicts a page that lacks it", () => {
        // The shape this workstream removed: admit, then render.
        expect(admissionViolations("export default async function P() { return <Surface /> }")).toEqual([
            "does not call the declared capability's gate",
            "does not refuse at the boundary",
            "does not filter chapters from the declaration",
            "accepts a ?section= the filter excluded — hidden, but reachable by URL",
        ]);

        // Gate present, but *after* the section is resolved — the ordering clause on its own.
        const reordered = [
            'const section = normalizeAccessWorkspaceChapter("users");',
            "if (!canManageUsersAndRoles(access)) {",
            '    redirect("/unauthorized");',
            "}",
            "const chapters = visibleAccessChapters(heldAccessCapabilities(access));",
            "if (section && !chapters.includes(section)) {}",
        ].join("\n");
        expect(admissionViolations(reordered)).toEqual([
            "resolves the section before gating — a chapter is reachable while the refusal is pending",
        ]);

        // Gated and filtered, but the requested section is never re-checked against the filter —
        // the exact "hidden in the nav, reachable by URL" state `07/AE-4` rejects.
        const unchecked = readWeb(renderingPages[0]!).replace(
            "if (section && !chapters.includes(section)) {",
            "if (false) {"
        );
        expect(admissionViolations(unchecked)).toEqual([
            "accepts a ?section= the filter excluded — hidden, but reachable by URL",
        ]);
    });

    /**
     * W49-F2. Closing the URL is half the property; the other half is that nothing offers the door.
     * `/organization` drew an Access card, with a link, to principals `/organization/access` now
     * redirects — navigation promising what admission refuses, one level out from the chapter tabs.
     */
    it("filters the /organization Access card from the same declaration", () => {
        const admin = heldAccessCapabilities({
            roleKeys: ["admin"],
            permissionKeys: [SETTINGS_USERS_ROLES_PERMISSION],
        });
        const opsOnly = heldAccessCapabilities({ roleKeys: ["ops"], permissionKeys: [] });
        expect(isOrganizationDomainVisible("access", admin)).toBe(true);
        expect(isOrganizationDomainVisible("access", opsOnly)).toBe(false);

        // The declared capability is read from the surface declaration, not restated. If the two
        // ever diverge, the Access card and the Access page would gate on different keys.
        expect(ORGANIZATION_DOMAIN_CAPABILITIES.access).toBe(ACCESS_SURFACE_DECLARATIONS.users.capability);

        // Every key in the map must be a real domain — a typo would silently gate nothing.
        const domainKeys = organizationConfigurationDomains().map((d) => d.key);
        for (const key of Object.keys(ORGANIZATION_DOMAIN_CAPABILITIES)) {
            expect(domainKeys, `${key} is not an organization domain`).toContain(key);
        }

        // Undeclared domains are unfiltered *and only those*. This is the `05…§1` residue: they are
        // enforced by nothing, so there is nothing to filter on. When W-15 gives one a capability,
        // adding it here is what this assertion forces — it cannot acquire a gate and skip the nav.
        const undeclared = domainKeys.filter((key) => !(key in ORGANIZATION_DOMAIN_CAPABILITIES));
        expect(undeclared).not.toContain("access");
        for (const key of undeclared) {
            expect(isOrganizationDomainVisible(key, new Set()), `${key} claims a gate it has not got`).toBe(true);
        }

        // The page decides and the component filters — neither may be dropped. A default of "all"
        // in the component would make the whole filter a no-op for a caller that forgot the prop.
        const page = readWebCode("app/adminV2/settings/organization/page.tsx");
        expect(page).toContain("isOrganizationDomainVisible");
        expect(page).toContain("visibleDomainKeys={visibleDomainKeys}");
        const grid = readWebCode("components/adminV2/settings/organization/OrganizationConfigurationPage.tsx");
        expect(grid).toContain("visibleDomainKeys.includes(domain.key)");
        expect(grid).not.toMatch(/visibleDomainKeys\s*=\s*\[/);
    });

    it("leaves the client no way to re-derive the chapter list, or to hold an authorization prop", () => {
        const surface = readWebCode("components/adminV2/settings/access/AccessWorkspaceSurface.tsx");
        expect(surface).not.toContain("ACCESS_WORKSPACE_CHAPTERS");
        expect(surface).toContain("chapters.map");
        // The old in-shell denial notice is gone; a refusal happens at the boundary or not at all.
        expect(surface).not.toContain("access-permission-denied");
        // No boolean authorization prop survives on either client component. `05…§3.3` calls it
        // "a display prop, not an access decision"; leaving one invites the next author to trust it.
        expect(surface).not.toContain("canManage");
        expect(readWebCode("components/adminV2/settings/usersRoles/UsersRolesConfigurationPage.tsx")).not.toContain(
            "canManage"
        );
    });
});

/* ------------------------------------------------------------------ */
/* IA-8 — the deleted route is a redirect, not a closed door           */
/* ------------------------------------------------------------------ */

/**
 * Deleting a renderer is only safe if the URL it served still resolves. `next.config.ts` already
 * redirected these paths to `/organization/access` — Next evaluates `redirects()` *before* the
 * filesystem, so the deleted page had been shadowed and unreachable for some time and its deletion
 * changes no URL's behaviour. That argument is the thing worth locking: if someone removes the
 * redirect, the alias becomes a 404 and the deletion retroactively becomes a regression.
 *
 * The chain is followed rather than spot-checked. `/adminV2/settings/users-roles` reaches the
 * canonical URL through three separate rules, and asserting only the last one would pass on a
 * config where the first two had been dropped.
 */
type ConfiguredRedirect = { source: string; destination: string };

const REDIRECT_RULES: ConfiguredRedirect[] = (() => {
    const config = readWeb("next.config.ts");
    const start = config.indexOf("async redirects()");
    const end = config.indexOf("async rewrites()");
    // `rewrites()` uses the same object shape; reading past the boundary would mix the two route
    // phases and make the resolver describe a pipeline Next does not run.
    if (start < 0 || end < 0 || end <= start) throw new Error("next.config.ts: cannot isolate redirects()");
    return [...config.slice(start, end).matchAll(/source:\s*"([^"]+)",\s*destination:\s*"([^"]+)"/g)].map((m) => ({
        source: m[1]!,
        destination: m[2]!,
    }));
})();

/** First matching rule wins, as Next does. Supports the exact and `/:path*` forms in use. */
function applyFirstRedirect(pathname: string): string | null {
    for (const { source, destination } of REDIRECT_RULES) {
        if (source.endsWith("/:path*")) {
            const prefix = source.slice(0, -"/:path*".length);
            if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) continue;
            const rest = pathname.slice(prefix.length);
            return destination.replace("/:path*", rest);
        }
        if (source === pathname) return destination;
    }
    return null;
}

function resolveRedirectChain(pathname: string): { final: string; hops: string[] } {
    const hops: string[] = [];
    let current = pathname;
    // A cycle in the config would otherwise hang the suite rather than report itself.
    for (let i = 0; i < 10; i += 1) {
        const next = applyFirstRedirect(current);
        if (next === null || next === current) break;
        hops.push(next);
        current = next;
    }
    return { final: current, hops };
}

describe("IA-8 — one workspace, one rendering route", () => {
    it("has no second renderer on disk", () => {
        expect(fs.existsSync(path.join(REPO_ROOT, "web/app/adminV2/settings/users-roles"))).toBe(false);
    });

    it("still resolves every URL the deleted page used to serve", () => {
        for (const alias of [
            "/adminV2/settings/users-roles",
            "/admin/settings/users-roles",
            "/settings/users-roles",
            "/settings/users-roles/anything",
            // `app/adminV2/settings/user-access/page.tsx` and the two legacy-admin pages redirect
            // into this alias in application code, so their destination has to resolve too.
            "/settings/user-access",
        ]) {
            expect(resolveRedirectChain(alias).final, alias).toBe("/organization/access");
        }
    });

    it("follows the chain rather than one lucky rule", () => {
        // /adminV2/settings/users-roles → /admin/settings/users-roles → /settings/users-roles →
        // /organization/access. Three rules, each of which some other workstream could remove.
        const { hops } = resolveRedirectChain("/adminV2/settings/users-roles");
        expect(hops).toEqual([
            "/admin/settings/users-roles",
            "/settings/users-roles",
            "/organization/access",
        ]);
    });

    it("is not vacuous — the resolver leaves unmatched paths alone and terminates at the canonical URL", () => {
        // If `applyFirstRedirect` matched everything, every assertion above would pass for free.
        expect(resolveRedirectChain("/settings/no-such-surface-xyz")).toEqual({
            final: "/settings/no-such-surface-xyz",
            hops: [],
        });
        // The canonical URL is a fixed point. Were it redirected onward, the assertions above would
        // be describing a path that is not where the surface lives.
        expect(resolveRedirectChain("/organization/access").hops).toEqual([]);
        expect(REDIRECT_RULES.length).toBeGreaterThan(50);
    });

    it("routes the canonical URL to the surviving page, and to nothing else", () => {
        // The rewrite phase, read directly: `/organization/access` must land on the one file the
        // discovery above found. Deleting the duplicate and leaving the rewrite pointed at it would
        // be a 404 that no unit assertion above would notice.
        const config = readWeb("next.config.ts");
        const rewrites = config.slice(config.indexOf("async rewrites()"));
        expect(rewrites).toContain(
            '{ source: "/organization/access", destination: "/adminV2/settings/organization/access" }'
        );
        expect(renderingPages[0]).toBe("app/adminV2/settings/organization/access/page.tsx");
    });
});
