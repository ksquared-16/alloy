import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasPortalAdminMutateAccess } from "@/lib/admin/adminPortalRolePick";
const WEB_ROOT = join(process.cwd());

describe("Card 7 — settings/record UX parity access", () => {
    describe("drawer mutate model (client chrome only)", () => {
        it("portal admin role_key grants canMutate; ops does not", () => {
            expect(hasPortalAdminMutateAccess(["admin"])).toBe(true);
            expect(hasPortalAdminMutateAccess(["ops"])).toBe(false);
            expect(hasPortalAdminMutateAccess(["school_director", "ops"])).toBe(false);
            expect(hasPortalAdminMutateAccess(["school_director", "admin"])).toBe(true);
        });
    });

    describe("PATCH handler order — scope before field policy", () => {
        it("opportunity PATCH asserts scope before enforceDrawerFieldPoliciesOnPatch", () => {
            const src = readFileSync(join(WEB_ROOT, "app/api/admin/opportunities/[id]/route.ts"), "utf8");
            const scopeIdx = src.indexOf("assertExistingOpportunityMutableInAdminScope");
            const policyIdx = src.indexOf("enforceDrawerFieldPoliciesOnPatch");
            expect(scopeIdx).toBeGreaterThan(-1);
            expect(policyIdx).toBeGreaterThan(scopeIdx);
        });

        it("job PATCH asserts scope before enforceDrawerFieldPoliciesOnPatch", () => {
            const src = readFileSync(join(WEB_ROOT, "app/api/admin/jobs/[id]/route.ts"), "utf8");
            const scopeIdx = src.indexOf("assertJobInAccessScope");
            const policyIdx = src.indexOf("enforceDrawerFieldPoliciesOnPatch");
            expect(scopeIdx).toBeGreaterThan(-1);
            expect(policyIdx).toBeGreaterThan(scopeIdx);
        });
    });

    describe("field-definitions PATCH — admin-only gate", () => {
        it("route rejects non-admin portal role before DB write", () => {
            const src = readFileSync(join(WEB_ROOT, "app/api/admin/field-definitions/[id]/route.ts"), "utf8");
            const patchStart = src.indexOf("export async function PATCH");
            const patchBody = src.slice(patchStart, patchStart + 800);
            expect(patchBody).toContain('ctx.role !== "admin"');
            expect(patchBody).toContain("Forbidden");
        });
    });

    describe("executeAdminAction — CRM scope gate", () => {
        it("checks assertEntityDrawerRecordReadable when access scope restricts data", () => {
            const src = readFileSync(join(WEB_ROOT, "lib/admin/actions/executeAdminAction.ts"), "utf8");
            expect(src).toContain("accessScopeRestrictsData");
            expect(src).toContain("assertEntityDrawerRecordReadable");
            const restrictIdx = src.indexOf("accessScopeRestrictsData");
            const assertIdx = src.indexOf("assertEntityDrawerRecordReadable");
            expect(restrictIdx).toBeGreaterThan(-1);
            expect(assertIdx).toBeGreaterThan(restrictIdx);
        });
    });

    describe("action execute route — server authority", () => {
        it("loads access context and passes accessScope into executeAdminAction", () => {
            const src = readFileSync(join(WEB_ROOT, "app/api/admin/actions/execute/route.ts"), "utf8");
            expect(src).toContain("getAdminAccessContextCached");
            expect(src).toContain("scopeDimensionsFromAccess");
            expect(src).toContain("accessScope:");
        });
    });
});
