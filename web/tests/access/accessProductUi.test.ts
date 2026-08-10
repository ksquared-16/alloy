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

describe("Access landing model", () => {
    it("exposes exactly the four Access chapters as tiles with no conceptual summary cards", () => {
        const model = buildAccessLandingModel();
        expect(model.tiles.map((t) => t.id)).toEqual(["users", "roles", "scopes", "security"]);
        expect(model.summaryCards).toEqual([]);
    });

    it("routes every tile at /organization/access with the matching ?section=", () => {
        const model = buildAccessLandingModel();
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
    it("routes /organization/access (users-roles page) to the landing when no section is set, and to the workspace otherwise", () => {
        const page = read("app/adminV2/settings/users-roles/page.tsx");
        expect(page).toContain("OrganizationDomainLanding");
        expect(page).toContain("buildAccessLandingModel");
        expect(page).toContain("UsersRolesConfigurationPage");
        expect(page).toContain("normalizeAccessWorkspaceChapter");
    });

    it("Access workspace surface renders all four chapter pages behind a canManage gate", () => {
        const surface = read("components/adminV2/settings/access/AccessWorkspaceSurface.tsx");
        expect(surface).toContain("AccessUsersConfigurationPage");
        expect(surface).toContain("AccessRolesConfigurationPage");
        expect(surface).toContain("AccessScopesPage");
        expect(surface).toContain("AccessSecurityPage");
        expect(surface).toContain("access-permission-denied");
        expect(surface).toContain("data-testid=\"access-workspace-surface\"");
    });

    it("Users page opens Invite via a dialog, not a permanent inline form", () => {
        const src = read("components/adminV2/settings/access/AccessUsersConfigurationPage.tsx");
        expect(src).toContain('data-testid="access-users-invite"');
        expect(src).toContain("inviteOpen");
        expect(src).toContain('role="dialog"');
        expect(src).toContain('data-testid="access-user-role-select"');
        expect(src).toContain('data-testid="access-invite-steps"');
        expect(src).toContain('data-testid="access-invite-access-planned"');
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
        for (const file of [
            "components/adminV2/settings/access/AccessUsersConfigurationPage.tsx",
            "components/adminV2/settings/access/AccessRolesConfigurationPage.tsx",
            "components/adminV2/settings/access/AccessSecurityPage.tsx",
        ]) {
            const src = read(file);
            expect(src).toContain('data-capability="planned"');
        }
    });
});
