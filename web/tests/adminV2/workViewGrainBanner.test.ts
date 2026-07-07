import { describe, it, expect } from "vitest";
import { resolveWorkViewStageGrains, validateWorkViewGrainConsistency, GRAIN_LABELS } from "@/lib/lifecycle/stageGrainV1";
import type { StageGrain } from "@/lib/lifecycle/stageGrainV1";

/**
 * Tests covering the grain banner logic for WorkViewProcessEditorCard.
 * The component uses validateWorkViewGrainConsistency + GRAIN_LABELS to decide
 * which banner state to render (confirmed grain / missing / mixed-grain warning).
 */

function grainBannerState(
    stageGrains: (StageGrain | undefined)[],
    catchAll = false,
): "ok" | "missing" | "mixed" | "catch-all" {
    if (catchAll) return "catch-all";
    const defined = stageGrains.filter((g): g is StageGrain => g !== undefined);
    if (defined.length === 0) return "missing";
    const { valid } = validateWorkViewGrainConsistency(stageGrains);
    return valid ? "ok" : "mixed";
}

describe("Work View grain banner — display state", () => {
    it("shows catch-all informational state for process-wide All views", () => {
        expect(grainBannerState(["family", "child"], true)).toBe("catch-all");
        expect(grainBannerState([], true)).toBe("catch-all");
    });

    it("shows confirmed family grain when all stages are family", () => {
        expect(grainBannerState(["family", "family"])).toBe("ok");
        expect(GRAIN_LABELS["family"]).toBe("Family");
    });

    it("shows confirmed child grain when all stages are child", () => {
        expect(grainBannerState(["child", "child", "child"])).toBe("ok");
        expect(GRAIN_LABELS["child"]).toBe("Child");
    });

    it("shows confirmed work_item grain when all stages are work_item", () => {
        expect(grainBannerState(["work_item"])).toBe("ok");
        expect(GRAIN_LABELS["work_item"]).toBe("Work Item");
    });

    it("shows missing grain when no stages have grain configured", () => {
        expect(grainBannerState([])).toBe("missing");
        expect(grainBannerState([undefined, undefined])).toBe("missing");
    });

    it("shows missing grain when stageGrains is empty (no stages in process)", () => {
        expect(grainBannerState([])).toBe("missing");
    });

    it("shows mixed warning for family + child combination", () => {
        expect(grainBannerState(["family", "child"])).toBe("mixed");
    });

    it("shows mixed warning for family + work_item combination", () => {
        expect(grainBannerState(["family", "work_item"])).toBe("mixed");
    });

    it("ignores undefined grains when computing consistency — partial config is ok", () => {
        // One stage configured, one not — not mixed, just partial
        expect(grainBannerState([undefined, "family"])).toBe("ok");
    });
});

describe("Work View mixed-grain save guardrail", () => {
    it("mixed grain produces invalid consistency", () => {
        const { valid, message } = validateWorkViewGrainConsistency(["family", "child"]);
        expect(valid).toBe(false);
        expect(message).toBeTruthy();
    });

    it("save should be enabled when no stage scope (predicate-only views like All Leads)", () => {
        const grains = resolveWorkViewStageGrains([], { lead: "family", waitlist: "child" });
        expect(grains).toEqual([]);
        const isMixedGrain = !validateWorkViewGrainConsistency(grains).valid;
        expect(isMixedGrain).toBe(false);
    });

    it("save should be disabled when mixed grain (isMixedGrain = true)", () => {
        const grains: (StageGrain | undefined)[] = ["family", "child"];
        const isMixedGrain = !validateWorkViewGrainConsistency(grains).valid;
        expect(isMixedGrain).toBe(true);
    });

    it("save should be enabled when grain is consistent", () => {
        const grains: (StageGrain | undefined)[] = ["family", "family"];
        const isMixedGrain = !validateWorkViewGrainConsistency(grains).valid;
        expect(isMixedGrain).toBe(false);
    });

    it("save should be enabled when no grain is configured (not blocking, just warning)", () => {
        const grains: (StageGrain | undefined)[] = [undefined, undefined];
        const isMixedGrain = !validateWorkViewGrainConsistency(grains).valid;
        expect(isMixedGrain).toBe(false);
    });
});
