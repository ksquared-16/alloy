import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const topNavPath = join(dirname(fileURLToPath(import.meta.url)), "../../../app/adminV2/components/TopNavBar.tsx");

describe("TopNavBar assistant entry (Interaction Layer V1 Card 6)", () => {
    it("does not expose a header Assistant trigger — bottom command bar is the home", () => {
        const src = readFileSync(topNavPath, "utf8");
        expect(src).not.toContain("data-global-assistant-header-trigger");
        expect(src).not.toContain(">Assistant<");
        expect(src).not.toContain("focusCommandBar");
    });

    it("retains Messages quick action without AI log tab", () => {
        const src = readFileSync(topNavPath, "utf8");
        expect(src).not.toContain("AI log");
        expect(src).not.toContain("/adminV2/ai-activity");
        expect(src).toContain("Messages");
    });
});
