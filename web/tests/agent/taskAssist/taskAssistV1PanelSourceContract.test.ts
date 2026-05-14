import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const panelPath = join(dirname(fileURLToPath(import.meta.url)), "../../../components/admin/taskAssist/TaskAssistV1OpportunityPanel.tsx");

describe("TaskAssistV1OpportunityPanel source contract (V1 UI safety)", () => {
    it("disables ineligible recipient radios and clears draft state on channel change", () => {
        const src = readFileSync(panelPath, "utf8");
        expect(src).toContain("disabled={!eligible}");
        expect(src).toContain("onChannelChange");
        expect(src).toMatch(/setProposal\(null\)/);
        expect(src).not.toMatch(/schedule/i);
        expect(src.toLowerCase()).not.toContain("reminder");
        expect(src.toLowerCase()).not.toContain("workflow");
    });
});
