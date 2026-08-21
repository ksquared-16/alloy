/**
 * §4 / §10 — where a person may work is a property of the PERSON, and the user detail says so once.
 *
 * Three changes are locked here, and each one is a claim about authority rather than layout:
 *
 * 1. **Access Scopes is retired as a chapter.** It configured nothing — two cards linking out to
 *    Locations and Departments, which own those catalogs. Scope is now set where it applies.
 * 2. **The user detail has three tabs.** `Roles` and `Access` answered halves of one question and
 *    made an operator open both to change either; `History` was a tab whose only content said there
 *    was no history. Merging them must not change the role write, which is still the replacement
 *    `PATCH` with `M2-17`'s acknowledgement in front of it.
 * 3. **Departments are demoted, not hidden.** `OD-8` keeps them out of the V1 experience. A person
 *    restricted to two departments has narrower authority than a screen that omits the fact
 *    implies, so the restriction is named on Overview and its editor opens itself.
 *
 * These are source assertions. They are worth having anyway: each one is a property that would
 * regress silently — a tab quietly reappearing, a `<details>` losing its `open`, a link pointing at
 * a chapter that no longer exists — and a browser run proves the composition, not the intent.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
    ACCESS_WORKSPACE_CHAPTERS,
    ACCESS_WORKSPACE_CHAPTER_META,
    RETIRED_ACCESS_CHAPTERS,
    normalizeAccessWorkspaceChapter,
} from "@/lib/access/accessChapterRoutes";
import { buildAccessLandingModel } from "@/lib/configRuntime/accessLandingModel";

const REPO_ROOT = path.join(__dirname, "..", "..");
const USERS_PAGE = "components/adminV2/settings/access/AccessUsersConfigurationPage.tsx";
const SURFACE = "components/adminV2/settings/access/AccessWorkspaceSurface.tsx";

function read(rel: string): string {
    return fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
}

/** Comments describe intent; only executable source proves it. */
function code(rel: string): string {
    return read(rel)
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

describe("Access Scopes is gone as a destination, and old links still land somewhere chosen", () => {
    it("is not a chapter, a tile, or a rendered page", () => {
        expect(ACCESS_WORKSPACE_CHAPTERS).toEqual(["users", "roles", "security"]);
        expect(Object.keys(ACCESS_WORKSPACE_CHAPTER_META).sort()).toEqual(["roles", "security", "users"]);
        expect(buildAccessLandingModel(ACCESS_WORKSPACE_CHAPTERS).tiles.map((t) => t.id)).toEqual([
            "users",
            "roles",
            "security",
        ]);
        expect(code(SURFACE)).not.toContain("AccessScopesPage");
        expect(fs.existsSync(path.join(REPO_ROOT, "components/adminV2/settings/access/AccessScopesPage.tsx"))).toBe(
            false,
        );
    });

    it("resolves `?section=scopes` to the chapter that inherited the concern, deliberately", () => {
        // Not by falling through to a default: the mapping is named, so changing the default later
        // cannot silently repoint an old bookmark at an unrelated screen.
        expect(RETIRED_ACCESS_CHAPTERS.scopes).toBe("users");
        expect(normalizeAccessWorkspaceChapter("scopes")).toBe("users");
        expect(normalizeAccessWorkspaceChapter("SCOPES")).toBe("users");
        // A key that never existed is still nothing — the alias table is not a wildcard.
        expect(normalizeAccessWorkspaceChapter("nonsense")).toBeNull();
    });

    it("keeps scope STORAGE and ENFORCEMENT untouched — the route the editor writes still exists", () => {
        // The decision retired a navigation entry, not a mechanism. If this file disappeared, the
        // retirement would have removed the ability to set scope rather than relocating it.
        expect(fs.existsSync(path.join(REPO_ROOT, "app/api/admin/users/[userId]/access-scope/route.ts"))).toBe(true);
        expect(code(USERS_PAGE)).toContain("access-scope");
    });
});

describe("the user detail is three tabs, and the merge did not weaken the role write", () => {
    const src = code(USERS_PAGE);

    it("offers Overview, Role & Access, and Security — and no empty History", () => {
        expect(src).toContain('type AccessUserTab = "overview" | "access" | "security"');
        expect(src).toContain('label: "Role & Access"');
        expect(src).not.toContain('tab === "history"');
        expect(src).not.toContain('access-user-history');
    });

    it("puts the role picker inside the Access tab rather than deleting it", () => {
        // The merge is a relocation. Losing the picker would remove an operator's only way to
        // change a role from this surface, which no decision authorized.
        const accessTabStart = src.indexOf('tab === "access" ?');
        const securityStart = src.indexOf('data-testid="access-user-security"');
        expect(accessTabStart).toBeGreaterThan(-1);
        expect(securityStart).toBeGreaterThan(accessTabStart);
        const accessTab = src.slice(accessTabStart, securityStart);
        expect(accessTab).toContain('data-testid="access-user-role-select"');
        expect(accessTab).toContain('data-testid="access-user-role-save"');
        // `ConfigWorkspaceCard` takes `testId`; the rendered attribute is the same thing.
        expect(accessTab).toContain('testId="access-user-access-locations"');
    });

    it("keeps M2-17's acknowledgement in front of the replacement write", () => {
        // `PATCH …/role` replaces every role row for the pair. Moving the control to another tab
        // must not move it away from the confirmation that stops a silent multi-role deletion —
        // and that boundary is D2/I-10's, which this tranche does not decide.
        expect(src).toContain("rolesLostBySave");
        expect(src).toContain("access-user-role-replace-confirm");
        expect(src).toContain("confirmRoleReplace");
    });
});

describe("Overview answers who, what and where without a second click", () => {
    const src = code(USERS_PAGE);

    it("shows the name as a name — never the email standing in for one", () => {
        expect(src).toContain("access-user-overview-name");
        expect(src).toContain("identityOf(selected).name");
        // The pair that makes an unnamed account read as unnamed in both places.
        expect(src).toContain("identityHeadline");
        expect(src).toContain("identitySubtitle");
        expect(src).not.toContain("display_name || m.email");
    });

    it("states where they work, and refuses to call an unconfigured scope `All locations`", () => {
        expect(src).toContain("access-user-overview-location-summary");
        // `scopeSummary` carries certainty; the card branches on it rather than printing the label
        // unconditionally, which is what W-45/W-47 removed from the read path.
        expect(src).toContain('selectedLocationScope?.certainty === "read"');
        expect(src).toContain("UnknownValue");
    });

    it("puts the location NAMES one disclosure away when the summary compresses them", () => {
        // "3 locations" is the right rail-row summary and the wrong final answer on the page an
        // operator opened to check which three.
        expect(src).toContain("access-user-overview-location-detail");
        expect(src).toContain("selected.site_location_ids.map");
    });

    it("names a department restriction instead of omitting it", () => {
        // Demoting departments out of the V1 experience must not make an existing restriction
        // invisible — an omitted restriction is a screen claiming broader access than exists.
        expect(src).toContain("access-user-overview-department-restriction");
        expect(src).toContain('selected.department_scope === "restricted"');
        expect(src).toContain("Additional restriction applies");
    });

    it("opens the department editor by itself whenever one is configured", () => {
        expect(src).toContain("access-user-access-departments-advanced");
        expect(src).toContain('open={deptScope === "restricted"}');
    });
});

describe("Invite collects identity and location access, and reports both halves honestly", () => {
    const src = code(USERS_PAGE);

    it("collects first and last name as INPUTS to the canonical full name", () => {
        expect(src).toContain("access-invite-first-name");
        expect(src).toContain("access-invite-last-name");
        expect(src).toContain("first_name: inviteFirstName.trim()");
        expect(src).toContain("last_name: inviteLastName.trim()");
        // No Access-owned profile store: the halves are never stored, only the derived name.
        expect(code("app/api/admin/users/route.ts")).toContain("fullNameFromParts");
        expect(code("app/api/admin/users/route.ts")).not.toContain("first_name:");
    });

    it("asks for location access instead of pointing at a second screen", () => {
        expect(src).toContain("access-invite-location-access");
        expect(src).toContain("inviteScopePayload");
        expect(src).not.toContain("access-invite-access-planned");
    });

    it("refuses to submit `Selected locations` with nothing selected", () => {
        expect(src).toContain("inviteSiteSelectionIsComplete");
    });

    it("does not report plain success when the account was created but the scope was not", () => {
        // Two writes. Calling the whole thing a failure would be false — the account exists — and
        // calling it a success would claim a restriction that was never stored.
        expect(src).toContain("scopeFailure");
        expect(src).toContain("their location access was not set");
    });
});
