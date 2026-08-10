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
    it("records W49-F1 — send-password-reset is reached from Users and enforces a role, not the capability", () => {
        const route = "app/api/admin/send-password-reset/route.ts";
        expect(ACCESS_SURFACE_DECLARATIONS.users.divergentRoutes?.map((d) => d.route)).toContain(route);
        expect(readWeb("components/adminV2/settings/access/AccessUsersConfigurationPage.tsx")).toContain(
            "/api/admin/send-password-reset"
        );
        expect(readWeb(route)).toContain('ctx.role !== "admin"');
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
        expect(heldAccessCapabilities({ roleKeys: ["admin"], permissionKeys: [] })).toEqual(
            new Set([SETTINGS_USERS_ROLES_PERMISSION])
        );
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
    it("discovers the pages rendering the surface from disk", () => {
        // IA-8: one workspace, two live rendering routes. If this number changes, a page was added
        // or W-51 deleted the duplicate — either way the gate list below must be re-read, not
        // assumed. The assertion names the count so the change cannot pass silently.
        expect(renderingPages).toEqual([
            "app/adminV2/settings/organization/access/page.tsx",
            "app/adminV2/settings/users-roles/page.tsx",
        ]);
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
        const admin = heldAccessCapabilities({ roleKeys: ["admin"], permissionKeys: [] });
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
