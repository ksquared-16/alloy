import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const drawerPath = join(dirname(fileURLToPath(import.meta.url)), "../../../components/admin/AdminEntityDrawer.tsx");

describe("AdminEntityDrawer opportunity communications tab", () => {
    it("does not render Task Assist drawer launcher CTA (command bar is the entry point)", () => {
        const src = readFileSync(drawerPath, "utf8");
        expect(src).not.toContain("TaskAssistOpportunityLauncher");
        expect(src).not.toContain("Use assistant for this opportunity");
        expect(src).toContain("data-admin-opportunity-comms-panel");
    });
});
