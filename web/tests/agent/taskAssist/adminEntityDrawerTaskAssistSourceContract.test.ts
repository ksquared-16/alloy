import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const drawerPath = join(dirname(fileURLToPath(import.meta.url)), "../../../components/admin/AdminEntityDrawer.tsx");

describe("AdminEntityDrawer Task Assist placement (Card 8)", () => {
    it("does not import or render full TaskAssistV1OpportunityPanel", () => {
        const src = readFileSync(drawerPath, "utf8");
        expect(src).not.toContain("TaskAssistV1OpportunityPanel");
        expect(src).toContain("TaskAssistOpportunityLauncher");
        expect(src).not.toContain("TaskAssistOpportunityWorkspace");
    });
});
