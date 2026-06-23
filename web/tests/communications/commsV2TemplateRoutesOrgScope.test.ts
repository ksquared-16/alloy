import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Comms V2 Phase 1 / B2 — route source contract.
 * Verifies (without a live DB) that every template route follows the required
 * admin pattern, scopes by org_id, and contains no provider code. This is the
 * automatable half of "test org scoping"; full request-level scoping is exercised
 * in integration/CI against Supabase.
 */

const ROUTES_DIR = join(process.cwd(), "app", "api", "admin", "communications", "templates");

const ROUTE_FILES = [
    "route.ts",
    join("[id]", "route.ts"),
    join("[id]", "preview", "route.ts"),
    join("[id]", "archive", "route.ts"),
];

function read(rel: string): string {
    const p = join(ROUTES_DIR, rel);
    expect(existsSync(p), `route exists: ${rel}`).toBe(true);
    return readFileSync(p, "utf8");
}

describe("B2 template routes — auth + org scoping + scope guards", () => {
    for (const rel of ROUTE_FILES) {
        describe(rel, () => {
            const src = read(rel);

            it("uses requireAdminOrOps -> getAdminContextCached -> createAdminClient", () => {
                expect(src).toMatch(/await requireAdminOrOps\(\)/);
                expect(src).toMatch(/getAdminContextCached\(\)/);
                expect(src).toMatch(/if \(!ctx\.ok\) return adminContextFailureResponse\(ctx\)/);
                expect(src).toMatch(/createAdminClient\(\)/);
            });

            it("scopes data access by org_id", () => {
                // Every route touches the org via an explicit equality filter and/or insert payload.
                const hasEqOrg = /\.eq\("org_id", orgId\)/.test(src);
                const hasInsertOrg = /org_id: orgId/.test(src);
                expect(hasEqOrg || hasInsertOrg).toBe(true);
            });

            it("contains NO provider / transmission code", () => {
                expect(src).not.toMatch(/twilio|sendgrid|resend|webhook|10dlc/i);
                expect(src).not.toMatch(/executeCommunicationsSend|enqueueCanonicalOutbound/);
            });
        });
    }

    it("read/update routes pair each template SELECT/UPDATE with an org_id filter", () => {
        for (const rel of [join("[id]", "route.ts"), join("[id]", "archive", "route.ts")]) {
            const src = read(rel);
            // count from("communication_templates") usages and ensure each is org-scoped
            const fromCount = (src.match(/\.from\("communication_templates"\)/g) ?? []).length;
            const eqOrgCount = (src.match(/\.eq\("org_id", orgId\)/g) ?? []).length;
            expect(eqOrgCount).toBeGreaterThanOrEqual(fromCount);
        }
    });

    it("inserts always carry org_id (create route)", () => {
        const src = read("route.ts");
        const insertCount = (src.match(/\.insert\(\{/g) ?? []).length;
        const insertOrgCount = (src.match(/org_id: orgId/g) ?? []).length;
        expect(insertCount).toBeGreaterThan(0);
        expect(insertOrgCount).toBeGreaterThanOrEqual(insertCount);
    });

    it("version inserts use legacy + B2 version fields via buildTemplateVersionInsertPayload", () => {
        for (const rel of ["route.ts", join("[id]", "route.ts")]) {
            const src = read(rel);
            expect(src).toContain("buildTemplateVersionInsertPayload");
        }
        const createRoute = read("route.ts");
        expect(createRoute).toMatch(/version_number:\s*1/);
    });
});
