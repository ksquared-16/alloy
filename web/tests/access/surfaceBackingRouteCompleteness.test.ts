/**
 * The backing-route join is only as good as the list it iterates.
 *
 * `surfaceCapabilityDeclaration.test.ts` asserts that every route a chapter NAMES declares that
 * chapter's capability. That is a sound check over an unsound subject: `backingRoutes` is
 * hand-authored, so a chapter that calls a route nobody wrote down is not a failure — it is
 * silence. The join never runs for that route, and the surface's gate is never compared to it.
 *
 * That is the enumerate-versus-discover hazard this initiative has already been bitten by
 * (`access-identity-v2-w5-lock-subject-pinning`): a lock whose subject is a literal list certifies
 * the list, not the product. When this test was written the Users chapter called six routes and
 * declared three, and the Roles chapter called four and declared two — every omitted route
 * happened to be correctly gated, so nothing was broken and nothing would have said so.
 *
 * So the subject here is DISCOVERED. Every `/api/...` request in a chapter's own source must
 * appear in that chapter's `backingRoutes` or its `divergentRoutes`. A chapter that grows a call
 * to an ungated route now fails until someone either gates it or names the divergence — which is
 * the mission's rule that presentation reflects authorization, applied to the record itself.
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { ACCESS_SURFACE_DECLARATIONS } from "@/lib/access/surfaceCapabilities";
// The chapter union is declared here and re-used by `surfaceCapabilities`, which imports rather
// than re-exports it. Importing it from the consumer typechecked under the test config's looser
// settings and failed `typecheck:tests`; taking it from its owner is also the honest dependency.
import type { AccessWorkspaceChapter } from "@/lib/access/accessChapterRoutes";

const WEB_ROOT = process.cwd();
const CHAPTER_DIR = path.join(WEB_ROOT, "components/adminV2/settings/access");

/**
 * The component that renders each chapter. This mapping is an anchor, not the subject — the routes
 * are read out of whatever these files actually contain. `security` renders no request at all,
 * which its `noBackingRoutesReason` records.
 */
const CHAPTER_COMPONENTS: Record<AccessWorkspaceChapter, string[]> = {
    users: ["AccessUsersConfigurationPage.tsx"],
    roles: ["AccessRolesConfigurationPage.tsx"],
    scopes: ["AccessScopesPage.tsx"],
    security: [],
};

/** `/api/admin/users/${id}/role?x=1` → `/api/admin/users/*\/role` */
function normalizeRequestPath(raw: string): string {
    return raw
        .split("?")[0]
        .replace(/\$\{[^}]*\}/g, "*")
        .replace(/\/+$/, "");
}

/** `app/api/admin/users/[userId]/role/route.ts` → `/api/admin/users/*\/role` */
function routeFileToPattern(routeFile: string): string {
    return (
        "/" +
        routeFile
            .replace(/^app\//, "")
            .replace(/\/route\.ts$/, "")
            .replace(/\[[^\]]+\]/g, "*")
    );
}

/** Every `/api/...` string or template literal handed to `fetch(` in a source file. */
function discoverRequestedPaths(source: string): string[] {
    const found = new Set<string>();
    for (const match of source.matchAll(/fetch\(\s*[`"']([^`"']*\/api\/[^`"']*)[`"']/g)) {
        found.add(normalizeRequestPath(match[1]));
    }
    return [...found].sort();
}

const chapters = Object.keys(CHAPTER_COMPONENTS) as AccessWorkspaceChapter[];

describe("the Access surface's backing-route record is complete, not merely correct", () => {
    it("finds the chapter components on disk", () => {
        // Non-vacuity: a mapping that pointed at nothing would make every check below pass.
        for (const [chapter, files] of Object.entries(CHAPTER_COMPONENTS)) {
            for (const file of files) {
                expect(fs.existsSync(path.join(CHAPTER_DIR, file)), `${chapter}: ${file} missing`).toBe(true);
            }
        }
    });

    it("no chapter component in the directory is left out of the mapping", () => {
        // A new chapter component that nobody mapped would be a silent hole of the same kind.
        const mapped = new Set(Object.values(CHAPTER_COMPONENTS).flat());
        const onDisk = fs
            .readdirSync(CHAPTER_DIR)
            .filter((f) => f.endsWith("Page.tsx") && discoverRequestedPaths(fs.readFileSync(path.join(CHAPTER_DIR, f), "utf8")).length > 0);
        for (const file of onDisk) {
            expect(mapped.has(file), `${file} issues requests but is mapped to no chapter`).toBe(true);
        }
    });

    it.each(chapters.filter((c) => CHAPTER_COMPONENTS[c].length > 0))(
        "%s: every route the chapter calls is named in its declaration",
        (chapter) => {
            const decl = ACCESS_SURFACE_DECLARATIONS[chapter];
            const declared = new Set(
                [...decl.backingRoutes, ...(decl.divergentRoutes ?? []).map((d) => d.route)].map(routeFileToPattern)
            );

            const requested = CHAPTER_COMPONENTS[chapter].flatMap((file) =>
                discoverRequestedPaths(fs.readFileSync(path.join(CHAPTER_DIR, file), "utf8"))
            );

            // Non-vacuity: a chapter that requests nothing cannot certify a join.
            expect(requested.length, `${chapter} issues no request; the assertion below is empty`).toBeGreaterThan(0);

            for (const requestPath of requested) {
                expect(
                    declared.has(requestPath),
                    `${decl.surfaceKey} calls ${requestPath}, which is in neither backingRoutes nor divergentRoutes — ` +
                        "the surface gate is never joined to that route's gate"
                ).toBe(true);
            }
        }
    );

    it("the security chapter genuinely issues no request, as its reason claims", () => {
        expect(CHAPTER_COMPONENTS.security).toHaveLength(0);
        expect(ACCESS_SURFACE_DECLARATIONS.security.noBackingRoutesReason).toBeTruthy();
    });

    it("is not vacuous — an unnamed route is detected", () => {
        const decl = ACCESS_SURFACE_DECLARATIONS.users;
        const declared = new Set(
            [...decl.backingRoutes, ...(decl.divergentRoutes ?? []).map((d) => d.route)].map(routeFileToPattern)
        );
        // A route the Users chapter does not call and does not name. If membership were computed
        // in a way that accepted anything, this would pass too.
        expect(declared.has("/api/admin/definitely-not-a-declared-access-route")).toBe(false);
    });

    it("maps dynamic segments rather than matching them literally", () => {
        expect(routeFileToPattern("app/api/admin/users/[userId]/role/route.ts")).toBe("/api/admin/users/*/role");
        expect(normalizeRequestPath("/api/admin/users/${encodeURIComponent(id)}/role")).toBe("/api/admin/users/*/role");
        expect(normalizeRequestPath("/api/admin/rbac/grants?role_key=${x}")).toBe("/api/admin/rbac/grants");
    });
});
