import { describe, expect, it } from "vitest";
import { opportunityQueueLayoutRuntimeRowsPossible } from "@/lib/workspace/opportunityQueueLayoutRuntimeActivation";

/**
 * Runtime convergence — Slice B. Proves the layout-doc fetch is only activated when
 * the legacy layout-runtime row path could actually render, so the canonical
 * compressed-row path does not trigger an unused per-lane fetch waterfall.
 */
describe("opportunityQueueLayoutRuntimeRowsPossible", () => {
    const withCrm = { semanticCrmCompact: { identity: "Ada" } };
    const withoutCrm = { semanticCrmCompact: undefined };

    it("is always possible when the OS runtime flag is OFF (legacy path owns rows)", () => {
        expect(opportunityQueueLayoutRuntimeRowsPossible([withCrm, withCrm], false)).toBe(true);
        expect(opportunityQueueLayoutRuntimeRowsPossible([], false)).toBe(true);
    });

    it("skips the fetch in runtime mode when every row has semanticCrmCompact", () => {
        expect(opportunityQueueLayoutRuntimeRowsPossible([withCrm, withCrm], true)).toBe(false);
    });

    it("activates the fetch in runtime mode when a row lacks semanticCrmCompact", () => {
        expect(opportunityQueueLayoutRuntimeRowsPossible([withCrm, withoutCrm], true)).toBe(true);
    });

    it("skips the fetch for an empty lane in runtime mode (no rows to render)", () => {
        expect(opportunityQueueLayoutRuntimeRowsPossible([], true)).toBe(false);
    });
});
