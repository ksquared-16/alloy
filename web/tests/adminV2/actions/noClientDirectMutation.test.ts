import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/**
 * Guards the doctrine: no client-side direct operational mutation for runtime actions.
 * Registered actions must mutate only via server-authoritative delegation, and their
 * API routes must run server-side with auth. These are static source assertions.
 */

function readLib(relPath: string): string {
    return readFileSync(join(process.cwd(), relPath), "utf8");
}

describe("no client-side direct mutation for registered actions", () => {
    it("create_lead mutates only via the canonical server executor", () => {
        const src = readLib("lib/adminV2/actions/definitions/createLeadAction.ts");
        expect(src).toContain("executeAdminAction");
        // No browser/client Supabase usage in the action definition.
        expect(src).not.toMatch(/createBrowserClient|supabaseBrowser|createClientComponentClient/);
    });

    it("update_status mutates only via the canonical status helper", () => {
        const src = readLib("lib/adminV2/actions/definitions/updateStatusAction.ts");
        expect(src).toContain("updateOpportunityStatusWithEvent");
        expect(src).not.toMatch(/createBrowserClient|supabaseBrowser|createClientComponentClient/);
    });

    it("the executor never writes directly (delegates to action.execute)", () => {
        const src = readLib("lib/adminV2/actions/actionExecutor.ts");
        expect(src).not.toMatch(/\.from\(["'`][a-z_]+["'`]\)\s*\.\s*(insert|update|delete|upsert)/);
    });

    it("execute + eligibility API routes are server-authoritative with auth", () => {
        const execute = readLib("app/api/admin/actions/execute/route.ts");
        const eligibility = readLib("app/api/admin/actions/eligibility/route.ts");
        for (const src of [execute, eligibility]) {
            expect(src).toContain("requireAdminOrOps");
            expect(src).toContain("createAdminClient");
        }
    });
});
