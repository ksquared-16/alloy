/**
 * W-59 (`RM-6`, `H1`) — one role editor.
 *
 * Plan: `docs/platform/planning/access-identity-v2/03-implementation-qa-sequence.md` §46.
 * Role editing was reachable from five surfaces and 1,155 lines of it were legacy. `H1` is the
 * corpus's first positive structural finding about authority location: all five called the same
 * four `/api/admin/rbac/*` routes, so the legacy clients held no authority the canonical surface
 * does not, and deleting them is security-neutral.
 *
 * **The reachability check §46 opens the workstream with has now been run**, against the local
 * certification tenant as an authenticated operator
 * (`certification/playwright/access-role-surface-reachability.cert.spec.ts`, 5/5). Its answer
 * strengthens `H1`: all three legacy paths already REDIRECTED to `/organization/access`, status
 * 200, and the role UI the operator saw was the canonical one. They were not a second way to edit
 * authority — they were unreachable code behind a redirect. So the deletion changes nothing an
 * operator can observe, which is a stronger claim than security-neutrality.
 *
 * Tier A, per §46: exactly one component renders a role-permission grid, and the retired routes
 * return 404 or redirect to the canonical href. Tier B (the canonical chapter is reachable and
 * unchanged) is the browser spec above.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const webRoot = join(__dirname, "..", "..");

/** The three legacy authority surfaces W-59 retires, by the route path an operator would type. */
const RETIRED_ROUTES = [
    "/legacy-admin/system/roles",
    "/legacy-admin/system/access-control",
    "/legacy-admin/users",
] as const;

/**
 * NOT retired, and deliberately named so the exclusion is auditable rather than an oversight.
 * `01…§41` records `customer-person-roles` as "a different concept sharing a word" — the
 * family/household relationship vocabulary, not operator authority. It is also LIVE: the adminV2
 * relationships surface imports its client.
 */
const NOT_RETIRED = "app/legacy-admin/system/customer-person-roles";

function sourceFilesUnder(rel: string): string[] {
    const out: string[] = [];
    const walk = (abs: string) => {
        if (!existsSync(abs)) return;
        for (const entry of readdirSync(abs)) {
            const p = join(abs, entry);
            if (statSync(p).isDirectory()) walk(p);
            else if (/\.tsx?$/.test(entry)) out.push(p);
        }
    };
    walk(join(webRoot, rel));
    return out.map((p) => relative(webRoot, p).split("\\").join("/"));
}

describe("W-59 / RM-6 — one role editor", () => {
    it("exactly one component in the tree renders a role-permission grid", () => {
        // Discovered, not enumerated. The grid is identified by the projection it consumes, so a
        // second editor reintroduced under any name or path fails this.
        const renderers = [...sourceFilesUnder("app"), ...sourceFilesUnder("components")].filter((rel) =>
            /buildPermissionGridRows|PermissionGridRow/.test(readFileSync(join(webRoot, rel), "utf8")),
        );
        expect(renderers).toEqual(["components/adminV2/settings/access/AccessRolesConfigurationPage.tsx"]);
    });

    it("the retired surfaces are gone from the tree", () => {
        for (const dir of [
            "app/legacy-admin/system/roles",
            "app/legacy-admin/system/access-control",
            "app/legacy-admin/users",
        ]) {
            expect(existsSync(join(webRoot, dir)), `${dir} still exists`).toBe(false);
        }
    });

    it("every retired route still resolves — deletion must not turn a redirect into a 404", () => {
        // The failure this prevents is specific and was live until this workstream: `/legacy-admin/
        // users` reached the canonical chapter through its OWN page.tsx, not through the redirect
        // table, and `components/admin/AdminLayout.tsx` still links to it. Deleting the page
        // without moving the rule would have 404'd a link the product still renders.
        const config = readFileSync(join(webRoot, "next.config.ts"), "utf8");
        for (const route of RETIRED_ROUTES) {
            const rule = new RegExp(
                `source:\\s*"${route.replace(/\//g, "\\/")}"\\s*,\\s*destination:\\s*"/organization/access"`,
            );
            expect(rule.test(config), `${route} has no redirect to the canonical chapter`).toBe(true);
        }
    });

    it("still links to the retired path, which is why the redirect is load-bearing", () => {
        // Non-vacuity for the rule above: if nothing linked to `/legacy-admin/users`, the redirect
        // would be dead weight and its absence harmless. This asserts the premise, so the day the
        // link goes the reason for the rule is re-examined rather than assumed.
        const layout = readFileSync(join(webRoot, "components/admin/AdminLayout.tsx"), "utf8");
        expect(layout).toContain("/legacy-admin/users");
    });

    it("leaves customer-person-roles alone — a different concept, and live", () => {
        expect(existsSync(join(webRoot, NOT_RETIRED)), "customer-person-roles must NOT be swept up").toBe(true);
        const importers = sourceFilesUnder("app").filter((rel) =>
            /customer-person-roles\/CustomerPersonRolesClient/.test(readFileSync(join(webRoot, rel), "utf8")),
        );
        expect(importers.length, "it is imported by a live surface, so it is not dead legacy code")
            .toBeGreaterThan(0);
    });

    it("no source still imports a deleted legacy authority client", () => {
        const dangling = [...sourceFilesUnder("app"), ...sourceFilesUnder("components"), ...sourceFilesUnder("lib")]
            .filter((rel) =>
                /legacy-admin\/(system\/(roles|access-control)|users)\//.test(readFileSync(join(webRoot, rel), "utf8")),
            );
        expect(dangling).toEqual([]);
    });
});
