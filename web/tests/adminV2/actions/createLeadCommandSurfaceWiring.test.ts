import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/**
 * Create Lead placement convergence — Actions open BOS command session by default.
 * Modal remains available behind NEXT_PUBLIC_BOS_CREATE_LEAD_SESSION=0.
 */

function read(relPath: string): string {
    return readFileSync(join(process.cwd(), relPath), "utf8");
}

describe("Create Lead BOS placement convergence", () => {
    it("event host dispatches BOS command session start when enabled", () => {
        const host = read("components/presentation/rightRail/CreateLeadEventHost.tsx");
        expect(host).toContain("dispatchStartBosCommandSession");
        expect(host).toContain("isBosCreateLeadSessionEnabled");
        expect(host).toContain("CreateLeadCommandSurface");
    });

    it("registry apply client routes create_lead to BOS session when enabled", () => {
        const src = read("lib/admin/actions/applyRegistryResolvedActionClient.ts");
        expect(src).toContain("dispatchStartBosCommandSession");
        expect(src).toContain("isBosCreateLeadSessionEnabled");
        expect(src).toContain('formKey === "create_lead"');
    });

    it("shared execute adapter remains the only mutation path", () => {
        const adapter = read("lib/platform/commands/createLead/executeCreateLeadCommand.ts");
        expect(adapter).toContain("/api/admin/actions/execute");
        expect(adapter).toContain("CREATE_LEAD_ACTION_KEY");
        expect(adapter).not.toMatch(/createBrowserClient|supabaseBrowser|createClientComponentClient/);
    });

    it("CreateLeadCommandSurface still hosts modal intake for compatibility fallback", () => {
        const src = read("components/platform/commands/createLead/CreateLeadCommandSurface.tsx");
        expect(src).toContain("executeCreateLeadCommand");
        expect(src).toContain("buildCreateLeadSuccess");
        expect(src).toContain("CreateLeadModal");
        expect(src).toContain("dispatchOpportunityQueueUpdated");
    });
});
