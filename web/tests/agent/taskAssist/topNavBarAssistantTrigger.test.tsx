import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const topNavPath = join(dirname(fileURLToPath(import.meta.url)), "../../../app/adminV2/components/TopNavBar.tsx");

describe("TopNavBar Task Assist trigger", () => {
    it("gates Assistant header control on isTaskAssistV1UiEnabled", () => {
        const src = readFileSync(topNavPath, "utf8");
        expect(src).toContain("isTaskAssistV1UiEnabled");
        expect(src).toContain("data-global-assistant-header-trigger");
        expect(src).toContain("focusCommandBar");
        expect(src).toContain("Assistant");
    });

    it("does not conflate with AI activity log route", () => {
        const src = readFileSync(topNavPath, "utf8");
        expect(src).toContain("/adminV2/ai-activity");
        expect(src).toContain("AI log");
    });
});
