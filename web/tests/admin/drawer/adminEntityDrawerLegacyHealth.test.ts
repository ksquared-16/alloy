import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const LEGACY_DRAWER = join(process.cwd(), "components/admin/AdminEntityDrawerLegacy.tsx");

/** Intentionally update when audited growth is expected. */
const BASELINE = {
    lineCount: 19_621,
    byteSize: 1_323_465,
    importCount: 243,
    useStateCount: 92,
    useEffectCount: 129,
    useLayoutEffectCount: 6,
    useCallbackCount: 44,
} as const;

/** Fail only on material growth beyond baseline (10% buffer). */
const GROWTH_TOLERANCE = 1.1;

function countPattern(src: string, pattern: RegExp): number {
    return (src.match(pattern) ?? []).length;
}

describe("adminEntityDrawerLegacyHealth", () => {
    it("reports legacy drawer repo-health metrics", () => {
        expect(statSync(LEGACY_DRAWER).isFile()).toBe(true);
        const src = readFileSync(LEGACY_DRAWER, "utf8");
        const lineCount = src.split("\n").length;
        const byteSize = statSync(LEGACY_DRAWER).size;
        const metrics = {
            lineCount,
            byteSize,
            importCount: countPattern(src, /^import /gm),
            useStateCount: countPattern(src, /useState\(/g),
            useEffectCount: countPattern(src, /useEffect\(/g),
            useLayoutEffectCount: countPattern(src, /useLayoutEffect\(/g),
            useCallbackCount: countPattern(src, /useCallback\(/g),
        };

        // Always report current metrics for visibility in CI output.
        console.info("[adminEntityDrawerLegacyHealth]", metrics);

        expect(metrics.lineCount).toBeGreaterThan(15_000);
        expect(metrics.byteSize).toBeGreaterThan(500_000);
        expect(metrics.importCount).toBeGreaterThan(100);
    });

    it("fails when legacy drawer grows materially without baseline update", () => {
        const src = readFileSync(LEGACY_DRAWER, "utf8");
        const lineCount = src.split("\n").length;
        const byteSize = statSync(LEGACY_DRAWER).size;
        const importCount = countPattern(src, /^import /gm);
        const useStateCount = countPattern(src, /useState\(/g);
        const useEffectCount = countPattern(src, /useEffect\(/g);
        const useLayoutEffectCount = countPattern(src, /useLayoutEffect\(/g);
        const useCallbackCount = countPattern(src, /useCallback\(/g);

        expect(lineCount).toBeLessThanOrEqual(Math.ceil(BASELINE.lineCount * GROWTH_TOLERANCE));
        expect(byteSize).toBeLessThanOrEqual(Math.ceil(BASELINE.byteSize * GROWTH_TOLERANCE));
        expect(importCount).toBeLessThanOrEqual(Math.ceil(BASELINE.importCount * GROWTH_TOLERANCE));
        expect(useStateCount).toBeLessThanOrEqual(Math.ceil(BASELINE.useStateCount * GROWTH_TOLERANCE));
        expect(useEffectCount).toBeLessThanOrEqual(Math.ceil(BASELINE.useEffectCount * GROWTH_TOLERANCE));
        expect(useLayoutEffectCount).toBeLessThanOrEqual(
            Math.ceil(BASELINE.useLayoutEffectCount * GROWTH_TOLERANCE)
        );
        expect(useCallbackCount).toBeLessThanOrEqual(Math.ceil(BASELINE.useCallbackCount * GROWTH_TOLERANCE));
    });
});
