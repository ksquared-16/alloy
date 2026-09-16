/**
 * SLICE 18 / S18-1 — WORK VIEW PROVISIONING POLICY.
 *
 * Work Unit entry provisioned SEVEN Work Views — the active one plus every inactive sibling — for
 * 404 KB of an 810 KB entry, and paid it again on every view switch because switching changes the
 * sibling set. The operator sees one view. It was also why warm entry was no faster than cold.
 *
 * The consumer was real (a pill click reuses the prepared answer), so this is a policy change, not a
 * bug fix: the warm moves from an exhaustive idle sweep to the place that carries a signal — pill
 * hover/focus, which names the exact destination and is untouched.
 *
 * These locks are source-shaped on purpose. The behaviour they protect is the ABSENCE of requests,
 * and the mounted before/after in the evidence document is what measures it; what a test can hold is
 * that the sweep does not grow back and that the intent path it was distinguished from survives.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RUNTIME = join(process.cwd(), "lib/presentation/runtime/useCommittedWorkUnitSurfaceRuntime.ts");
const SURFACE = join(process.cwd(), "components/presentation/workUnit/WorkUnitSurface.tsx");
const PILLS = join(process.cwd(), "components/presentation/workUnit/WorkViewPillStrip.tsx");
const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("S18-1 — Work Unit entry provisions the active view, not every view", () => {
    it("no effect sweeps the inactive Work Views", () => {
        const code = strip(read(RUNTIME));
        expect(code, "the exhaustive sibling sweep is what cost 404 KB per entry").not.toMatch(
            /for \(const id of ids\) prefetchWorkView\(id\)/,
        );
        expect(code, "its derivation is gone with it").not.toMatch(/siblingViewIds/);
    });

    it("prefetchWorkView survives — it is the intent path, not the sweep", () => {
        const code = strip(read(RUNTIME));
        expect(code).toMatch(/const prefetchWorkView = useCallback\(/);
        // Still exported through the surface intents, so pills can call it.
        expect(code).toMatch(/prefetchWorkView,/);
    });

    it("the pill strip still warms on hover and focus", () => {
        const code = read(PILLS);
        expect(code).toMatch(/onPointerEnter=\{warm\}/);
        expect(code).toMatch(/onFocus=\{warm\}/);
    });

    it("the surface still wires pill intent to the runtime's prefetch", () => {
        const code = read(SURFACE);
        expect(code).toMatch(/onPrefetch/);
    });

    it("no second cache, inflight registry, TTL or scheduler was introduced", () => {
        const code = read(RUNTIME);
        for (const forbidden of [
            "WorkViewProvisioningCache",
            "workViewInflight",
            "WORK_VIEW_PREFETCH_TTL",
            "new Map<string, Promise",
        ]) {
            expect(code, `${forbidden} would be a competing owner`).not.toContain(forbidden);
        }
    });

    it("the neighbour-SUBJECT warm is untouched — this slice changed the view axis only", () => {
        const code = strip(read(RUNTIME));
        expect(code).toMatch(/prewarmSubjectDestination\(/);
        expect(code, "its reveal gate stays").toMatch(/isWorkUnitPrimaryRevealActive\(\)/);
    });
});
