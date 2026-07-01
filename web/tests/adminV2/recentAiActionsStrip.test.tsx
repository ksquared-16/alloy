import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const stripPath = join(process.cwd(), "app/adminV2/components/aiActivity/RecentAiActionsStrip.tsx");

describe("RecentAiActionsStrip", () => {
    const src = readFileSync(stripPath, "utf8");

    it("reserves min height and shows unavailable retry instead of hiding", () => {
        expect(src).toContain("STRIP_MIN_HEIGHT_PX");
        expect(src).toContain("data-recent-operational-activity-strip");
        expect(src).toContain("Activity log unavailable");
        expect(src).toContain("Retry");
        expect(src).not.toMatch(/setHidden\s*\(\s*true\s*\)/);
    });

    it("uses soft refresh on activity event", () => {
        expect(src).toContain("load({ soft: true })");
        expect(src).toContain("Recent operational activity");
    });
});
