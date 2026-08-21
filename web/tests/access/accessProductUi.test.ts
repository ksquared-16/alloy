/**
 * Access product UI — landing model, chapter routing, and permission grid label hygiene.
 * UI-only surface; no schema or auth semantics under test here.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAccessLandingModel } from "@/lib/configRuntime/accessLandingModel";
import {
    ACCESS_WORKSPACE_CHAPTERS,
    accessWorkspaceChapterHref,
    normalizeAccessWorkspaceChapter,
} from "@/lib/access/accessChapterRoutes";
import { buildPermissionGridRows } from "@/lib/admin/permissionGrid";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

/** Block and line comments removed, so an assertion cannot be satisfied by a file's own prose. */
export function stripComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

function executableSource(rel: string): string {
    return stripComments(read(rel));
}

describe("Access landing model", () => {
    it("exposes exactly the Access chapters as tiles with no conceptual summary cards", () => {
        const model = buildAccessLandingModel(ACCESS_WORKSPACE_CHAPTERS);
        // Access Scopes is not among them. It linked out to Locations and Departments and
        // configured nothing itself; where a person may work is now set on the person.
        expect(model.tiles.map((t) => t.id)).toEqual(["users", "roles", "security"]);
        expect(model.summaryCards).toEqual([]);
    });

    // W-49: the tiles are navigation, so they filter from the chapter list the page admitted on.
    // Without this the landing offers a chapter the route refuses — `07/AE-4`'s failure in the one
    // place an operator is most likely to click.
    it("offers only the chapters it is given, and nothing when given none", () => {
        expect(buildAccessLandingModel(["users", "security"]).tiles.map((t) => t.id)).toEqual([
            "users",
            "security",
        ]);
        expect(buildAccessLandingModel([]).tiles).toEqual([]);
    });

    it("routes every tile at /organization/access with the matching ?section=", () => {
        const model = buildAccessLandingModel(ACCESS_WORKSPACE_CHAPTERS);
        for (const tile of model.tiles) {
            expect(tile.href).toContain("/organization/access?section=");
            expect(tile.href).toContain(`section=${tile.id}`);
        }
    });
});

describe("Access chapter routing", () => {
    it("normalizes only the four known chapters", () => {
        for (const chapter of ACCESS_WORKSPACE_CHAPTERS) {
            expect(normalizeAccessWorkspaceChapter(chapter)).toBe(chapter);
        }
        expect(normalizeAccessWorkspaceChapter("bogus")).toBeNull();
        expect(normalizeAccessWorkspaceChapter(null)).toBeNull();
        expect(normalizeAccessWorkspaceChapter(undefined)).toBeNull();
        expect(normalizeAccessWorkspaceChapter("  Users  ")).toBe("users");
    });

    it("builds deep links carrying optional userId / roleKey", () => {
        expect(accessWorkspaceChapterHref("users")).toBe("/organization/access?section=users");
        expect(accessWorkspaceChapterHref("users", { userId: "abc-123" })).toBe(
            "/organization/access?section=users&userId=abc-123",
        );
        expect(accessWorkspaceChapterHref("roles", { roleKey: "ops" })).toBe(
            "/organization/access?section=roles&roleKey=ops",
        );
        expect(accessWorkspaceChapterHref(null)).toBe("/organization/access");
    });
});

describe("Permission grid operator labels", () => {
    it("never uses a raw dotted permission_key as the operator-facing row label", () => {
        // W-10: rows are projected from the catalog, so this is a property of the projection over an
        // arbitrary catalog rather than of a hand-authored list. The projection over the *seeded*
        // catalog is asserted in `tests/admin/permissionGrid.test.ts` (RL-3).
        const rows = buildPermissionGridRows([
            { key: "crm.customers.read", group_key: "crm", label: "View customers / families" },
            { key: "crm.customers.write", group_key: "crm", label: "Manage customers / families" },
            { key: "reports.read", group_key: "reports", label: "View reports / analytics" },
            { key: "ai.enrichment.use", group_key: "ai", label: "Use AI enrichment" },
            { key: "sections.manage", group_key: "sections", label: "" },
        ]);
        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
            expect(row.label).not.toMatch(/\./);
            for (const key of [...row.readKeys, ...row.writeKeys]) {
                expect(row.label).not.toBe(key);
            }
        }
    });
});

describe("Access product UI wiring", () => {
    it("routes /organization/access to the landing when no section is set, and to the workspace otherwise", () => {
        // IA-8 removed the second renderer; the parenthetical "(users-roles page)" this assertion
        // used to carry named it. There is one page now, and it is this one.
        const page = read("app/adminV2/settings/organization/access/page.tsx");
        expect(page).toContain("OrganizationDomainLanding");
        expect(page).toContain("buildAccessLandingModel");
        expect(page).toContain("UsersRolesConfigurationPage");
        expect(page).toContain("normalizeAccessWorkspaceChapter");
    });

    // W-49 changed this assertion's subject. The surface used to render an in-shell denial notice
    // (`access-permission-denied`) for a principal it had already admitted; the gate moved to the
    // route boundary, so that notice is gone and its absence is the property worth locking.
    it("Access workspace surface renders every chapter page and no in-shell denial notice", () => {
        const surface = read("components/adminV2/settings/access/AccessWorkspaceSurface.tsx");
        expect(surface).toContain("AccessUsersConfigurationPage");
        expect(surface).toContain("AccessRolesConfigurationPage");
        expect(surface).toContain("AccessSecurityPage");
        // The retired chapter is gone from the renderer, not merely unlinked — an unreferenced
        // branch would still be a screen one URL away from an operator.
        expect(surface).not.toContain("AccessScopesPage");
        expect(surface).not.toContain("access-permission-denied");
        expect(surface).toContain("data-testid=\"access-workspace-surface\"");
    });

    it("Users page opens Invite via a dialog, not a permanent inline form", () => {
        const src = read("components/adminV2/settings/access/AccessUsersConfigurationPage.tsx");
        expect(src).toContain('data-testid="access-users-invite"');
        expect(src).toContain("inviteOpen");
        expect(src).toContain('role="dialog"');
        expect(src).toContain('data-testid="access-user-role-select"');
        expect(src).toContain('data-testid="access-invite-steps"');
        // The invite collects location access itself now. The card it replaced was a Planned notice
        // pointing at a second screen — accurate, and the reason every new account spent the gap
        // between invitation and follow-up organization-wide.
        expect(src).toContain('data-testid="access-invite-location-access"');
        expect(src).not.toContain('data-testid="access-invite-access-planned"');
        expect(src).not.toContain("Restricted</span>");
    });

    it("Roles page shows operator labels in the permissions grid, not raw permission_keys, in visible text", () => {
        const src = read("components/adminV2/settings/access/AccessRolesConfigurationPage.tsx");
        // W-10: the grid is projected from the catalog the permissions endpoint returns. The
        // component names no permission key at all — locked as RL-3 in `tests/admin/permissionGrid.test.ts`.
        expect(src).toContain("buildPermissionGridRows");
        expect(src).not.toContain("PERMISSION_GRID_ROWS");
        expect(src).toContain("row.label");
    });

    it("Planned surfaces render calm static copy and are marked with data-capability, not live fetches", () => {
        // W-57 changed how this assertion has to be written, and the reason is worth keeping.
        //
        // It used to look for the literal `data-capability="planned"`. When W-57 replaced the two
        // placeholder TABS with a marked ROW, the attribute became the expression
        // `data-capability={inert ? "planned" : undefined}` — and the test still passed, because the
        // workstream's own doc comment quotes the old literal. It was agreeing with prose.
        //
        // That is the same failure `admissionDoesNotAuthorize` and W-20's fixture already cost this
        // program: a scan that cannot tell what it matched is not evidence. So the source is
        // comment-stripped first, and the property asserted is the one that matters — the surface
        // marks unbuilt capability *somehow* — rather than one particular spelling of it.
        for (const file of [
            "components/adminV2/settings/access/AccessUsersConfigurationPage.tsx",
            "components/adminV2/settings/access/AccessRolesConfigurationPage.tsx",
            "components/adminV2/settings/access/AccessSecurityPage.tsx",
        ]) {
            const src = executableSource(file);
            expect(src, `${file} no longer marks planned capability in code`).toMatch(
                /data-capability=(?:"planned"|\{[^}]*"planned"[^}]*\})/,
            );
        }
    });

    it("the strip is real — a marking that exists only in a comment does not count", () => {
        // Non-vacuity on the stripper itself, proved against an input built for the purpose rather
        // than by asserting something about a real file.
        const prose = '/** the old shape was: data-capability="planned" */\nconst x = 1;';
        expect(stripComments(prose)).not.toMatch(/data-capability/);
        expect(stripComments('<li data-capability={inert ? "planned" : undefined}>')).toMatch(
            /data-capability=\{[^}]*"planned"/,
        );
    });
});
