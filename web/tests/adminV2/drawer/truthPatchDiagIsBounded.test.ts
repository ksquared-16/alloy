/**
 * @vitest-environment jsdom
 *
 * The diagnostic is window-guarded — it records nothing at all when `window` is absent, which in a
 * node environment makes every assertion below pass against an empty object and prove nothing.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
    markTruthPatchArrived,
    markFocusTruthHasRoster,
} from "@/lib/adminV2/viewModel/drawer/opportunity/drawerTruthPatchDiag";

/**
 * A DIAGNOSTIC THAT GROWS FOR AS LONG AS THE SESSION LASTS IS A LEAK.
 *
 * The per-subject marks map gained an entry per opportunity opened and evicted none. Each entry is
 * a handful of numbers, so it was never going to exhaust a tab — but an operator works a queue for
 * a whole shift, and "small" is not the same as "bounded".
 *
 * What must survive the bound is the thing a reader actually uses: the marks for the switch being
 * measured, and the positive-control counters, which count every event and not merely the retained
 * ones. A cap that quietly reset the counters would make an old reading look like no reading.
 */
type Diag = {
    observed: { arrivals: number; merges: number; focusTransitions: number };
    subjects: Record<string, { subject_id: string }>;
};
const read = (): Diag => (globalThis as unknown as Record<string, Diag>).__ALLOY_TRUTH_PATCH_DIAG__;

describe("truth patch diagnostic is bounded", () => {
    beforeEach(() => {
        delete (globalThis as unknown as Record<string, unknown>).__ALLOY_TRUTH_PATCH_DIAG__;
    });

    it("retains a bounded number of subjects however many are visited", () => {
        for (let i = 0; i < 200; i += 1) markTruthPatchArrived(`subject-${i}`);
        const d = read();
        expect(Object.keys(d.subjects).length).toBeLessThanOrEqual(24);
    });

    it("keeps the MOST RECENT subjects — the switch being measured is the one a reader wants", () => {
        for (let i = 0; i < 200; i += 1) markTruthPatchArrived(`subject-${i}`);
        const keys = Object.keys(read().subjects);
        expect(keys).toContain("subject-199");
        expect(keys).not.toContain("subject-0");
    });

    it("the positive control counts every event, not merely the retained ones", () => {
        // Eviction must not make a real observation look like an absent one — three probes in this
        // programme ran green while observing nothing, and `observed` is what disproves that.
        for (let i = 0; i < 200; i += 1) markTruthPatchArrived(`subject-${i}`);
        expect(read().observed.arrivals).toBe(200);
    });

    it("a subject seen again reuses its entry rather than adding another", () => {
        markTruthPatchArrived("same");
        markFocusTruthHasRoster("same");
        markTruthPatchArrived("same");
        expect(Object.keys(read().subjects)).toEqual(["same"]);
    });
});
