import { describe, expect, it } from "vitest";

import {
    BOS_OPERATIONAL_INTAKE_SHELL_SWELL_RATIO,
    buildOperationalIntakeShellPath,
} from "@/lib/bos/bosOperationalIntakeShellPath";

describe("buildOperationalIntakeShellPath", () => {
    it("returns closed stadium path with top-center swell", () => {
        const path = buildOperationalIntakeShellPath(1200, 760);
        expect(path.startsWith("M")).toBe(true);
        expect(path.endsWith("Z")).toBe(true);
        expect(path).toContain("Q 600");
        expect(path).toContain("A ");
    });

    it("keeps swell restrained", () => {
        const path = buildOperationalIntakeShellPath(1200, 760, {
            swellRatio: BOS_OPERATIONAL_INTAKE_SHELL_SWELL_RATIO,
        });
        const peakMatch = path.match(/Q 600 ([\d.]+)/);
        expect(peakMatch).not.toBeNull();
        const peakY = Number(peakMatch![1]);
        expect(peakY).toBeGreaterThanOrEqual(0);
        expect(peakY).toBeLessThan(8);
    });

    it("returns empty path for invalid dimensions", () => {
        expect(buildOperationalIntakeShellPath(0, 760)).toBe("");
        expect(buildOperationalIntakeShellPath(1200, 0)).toBe("");
    });
});
