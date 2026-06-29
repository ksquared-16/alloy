import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/**
 * Command Surface V3, Phase 2/3/4 — wiring guard.
 *
 * Create Lead must reach operators through the platform-owned Command Surface host
 * (`CreateLeadCommandSurface`) at every entry point, and that host must execute through the
 * shared adapter + standardized success contract — never a forked mutation path.
 */

function read(relPath: string): string {
    return readFileSync(join(process.cwd(), relPath), "utf8");
}

const WRAPPER = "components/platform/commands/createLead/CreateLeadCommandSurface.tsx";

const ENTRY_POINTS = [
    "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
    "app/adminV2/workspace/dept/[departmentId]/page.tsx",
    "app/adminV2/components/workspace/WorkspaceRootActionsRail.tsx",
];

describe("Create Lead Command Surface wiring", () => {
    it.each(ENTRY_POINTS)("entry point %s renders the platform Command Surface host", (relPath) => {
        const src = read(relPath);
        expect(src).toContain("CreateLeadCommandSurface");
        // The protected modal is no longer wired directly at the entry point.
        expect(src).not.toContain("<CreateLeadModal");
        // Execution is delegated to the shared adapter, not the legacy direct helper.
        expect(src).not.toContain("executeCreateLeadFromModal");
    });

    it("the host executes through the shared adapter and standardized success contract", () => {
        const src = read(WRAPPER);
        expect(src).toContain("executeCreateLeadCommand");
        expect(src).toContain("buildCreateLeadSuccess");
        // It still hosts the existing rich intake — internals are not rewritten.
        expect(src).toContain("CreateLeadModal");
    });

    it("the host dispatches the canonical queue refresh on success (New Leads count/list catches up)", () => {
        const src = read(WRAPPER);
        expect(src).toContain("dispatchOpportunityQueueUpdated");
        expect(src).toContain("create_lead");
    });

    it.each(ENTRY_POINTS)("entry point %s honors onRefresh (does not drop post-create refresh)", (relPath) => {
        const src = read(relPath);
        expect(src).toContain("onRefresh");
    });

    it("the host has no forked mutation path (delegates execution, never fetches directly)", () => {
        const src = read(WRAPPER);
        expect(src).not.toMatch(/fetch\s*\(/);
        expect(src).not.toMatch(/createBrowserClient|supabaseBrowser|createClientComponentClient/);
    });

    it("the shared adapter is the only client mutation path it uses", () => {
        const adapter = read("lib/platform/commands/createLead/executeCreateLeadCommand.ts");
        expect(adapter).toContain("/api/admin/actions/execute");
        expect(adapter).toContain("CREATE_LEAD_ACTION_KEY");
        expect(adapter).not.toMatch(/createBrowserClient|supabaseBrowser|createClientComponentClient/);
    });
});
