import { describe, expect, it } from "vitest";
import {
    locationSelectorAttentionSignal,
    locationSelectorSignal,
} from "@/lib/locations/locationSelectorSignal";

describe("locationSelectorAttentionSignal", () => {
    it("returns null when no Fix items exist", () => {
        expect(locationSelectorAttentionSignal(0)).toBeNull();
    });

    it("formats singular and plural attention copy", () => {
        expect(locationSelectorAttentionSignal(1)).toBe("1 needs attention");
        expect(locationSelectorAttentionSignal(5)).toBe("5 need attention");
    });

    it("never surfaces readiness percentages", () => {
        const source = locationSelectorAttentionSignal.toString();
        expect(source).not.toContain("ready");
        expect(source).not.toContain("setupPercent");
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
