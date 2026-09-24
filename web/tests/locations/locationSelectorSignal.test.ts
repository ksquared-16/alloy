import { describe, expect, it } from "vitest";
import {
    locationSelectorAttentionSignal,
    locationSelectorSignal,
} from "@/lib/locations/locationSelectorSignal";

describe("locationSelectorAttentionSignal", () => {
    it("returns null when no Fix items exist", () => {
        expect(locationSelectorAttentionSignal({ criticalCount: 0 })).toBeNull();
    });

    it("names one issue, and aggregates several", () => {
        // A single problem now says what it is; the bare count remains only as
        // the fallback for when the model resolved no item.
        expect(
            locationSelectorAttentionSignal({ criticalCount: 1, topAttention: { label: "3 rooms need capacity" } }),
        ).toBe("3 rooms need capacity");
        expect(locationSelectorAttentionSignal({ criticalCount: 1 })).toBe("1 needs attention");
        expect(locationSelectorAttentionSignal({ criticalCount: 5 })).toBe("5 need attention");
    });

    it("never surfaces readiness percentages", () => {
        /*
         * Asserted on OUTPUT, not on the function's source text. The source grep
         * for "ready" tripped on the word "already" in a comment — a prose match
         * that says nothing about behaviour. `setupPercent` stays a source check
         * because that identifier is unambiguous.
         */
        for (const signal of [
            locationSelectorAttentionSignal({ criticalCount: 1, topAttention: { label: "3 rooms need capacity" } }),
            locationSelectorAttentionSignal({ criticalCount: 4 }),
        ]) {
            expect(signal).not.toMatch(/%|ready|complete/i);
        }
        expect(locationSelectorAttentionSignal.toString()).not.toContain("setupPercent");
    });
});

describe("locationSelectorSignal (compat)", () => {
    it("prioritizes Inactive over attention and locality", () => {
        expect(
            locationSelectorSignal({
                isActive: false,
                criticalCount: 3,
                locality: "Bend, Oregon",
            }),
        ).toBe("Inactive");
    });

    it("prefers attention over locality when active", () => {
        expect(
            locationSelectorSignal({
                isActive: true,
                criticalCount: 1,
                locality: "Bend, Oregon",
            }),
        ).toBe("1 needs attention");
    });
});
