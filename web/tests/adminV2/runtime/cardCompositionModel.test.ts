import { describe, expect, it } from "vitest";

import {
    arePreferredPartners,
    CARD_COMPOSITION_PREFERENCES,
    DEFAULT_CARD_COMPOSITION_PREFERENCE,
    resolveCardCompositionPreference,
    weightToDefaultFootprint,
    weightToStackDensity,
} from "@/lib/adminV2/runtime/focusPanel/cardCompositionModel";
import { footprintToGridSpan } from "@/lib/adminV2/runtime/focusPanel/system5OperationalSurfaceSpec";

describe("card composition model", () => {
    it("encodes the doctrine weights (emphasis, not priority tier)", () => {
        // Household is Tier-2 context but Heavy (needs area).
        expect(CARD_COMPOSITION_PREFERENCES.household?.weight).toBe("heavy");
        expect(CARD_COMPOSITION_PREFERENCES.children?.weight).toBe("heavy");
        // Current Work / Attention are Tier-1 decisions but Light (one answer).
        expect(CARD_COMPOSITION_PREFERENCES.current_work?.weight).toBe("light");
        expect(CARD_COMPOSITION_PREFERENCES.attention?.weight).toBe("light");
        // Readiness is the verdict beside an anchor.
        expect(CARD_COMPOSITION_PREFERENCES.readiness_kpi?.weight).toBe("medium");
    });

    it("declares preferred partners as engine row-affinity hints", () => {
        expect(CARD_COMPOSITION_PREFERENCES.household?.preferredPartners).toContain("children");
        expect(CARD_COMPOSITION_PREFERENCES.current_work?.preferredPartners).toContain("tour_summary");
        expect(arePreferredPartners("current_work", "tour_summary")).toBe(true);
        // Mutual detection works even when only one side lists the other.
        expect(arePreferredPartners("household", "communications")).toBe(true);
        expect(arePreferredPartners("household", "audit")).toBe(false);
    });

    it("falls back to the conservative default for unconfigured cards", () => {
        expect(resolveCardCompositionPreference("audit")).toEqual(
            DEFAULT_CARD_COMPOSITION_PREFERENCE,
        );
    });

    it("merges a surface override over the platform default (partial wins)", () => {
        const resolved = resolveCardCompositionPreference("current_work", { weight: "heavy", maxWidth: "full" });
        expect(resolved.weight).toBe("heavy");
        expect(resolved.maxWidth).toBe("full");
        // Untouched fields keep the platform default.
        expect(resolved.preferredPartners).toEqual(
            CARD_COMPOSITION_PREFERENCES.current_work?.preferredPartners,
        );
    });

    it("derives footprint (width) from weight, reconciling the prior prototype", () => {
        expect(weightToDefaultFootprint("heavy")).toBe("wide");
        expect(weightToDefaultFootprint("medium")).toBe("medium");
        expect(weightToDefaultFootprint("light")).toBe("narrow");
        // Heavy → wide → 2 grid columns (matches the footprint engine).
        expect(footprintToGridSpan(weightToDefaultFootprint("heavy"))).toBe(2);
    });

    it("expresses weight as density when the surface collapses to one column", () => {
        expect(weightToStackDensity("heavy")).toBe("standard");
        expect(weightToStackDensity("light")).toBe("compact");
    });
});
