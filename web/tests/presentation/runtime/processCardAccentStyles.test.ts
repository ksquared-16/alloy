import { describe, expect, it } from "vitest";

import {
    PROCESS_CARD_ACCENT_LABELS,
    PROCESS_CARD_ACCENT_STYLES,
    normalizeProcessCardAccent,
    workspaceHeaderKpiIconClass,
} from "@/lib/presentation/runtime/processCardAccentStyles";

describe("processCardAccentStyles", () => {
    it("maps pine to Bend Pine brand tokens (not legacy alloy-pine / Midnight Forge)", () => {
        const pine = PROCESS_CARD_ACCENT_STYLES.pine;
        expect(pine.rail).toContain("alloy-bend-pine");
        expect(pine.rail).not.toContain("alloy-pine");
    });

    it("maps blue to Alloy Blue — distinct from Bend Pine", () => {
        const blue = PROCESS_CARD_ACCENT_STYLES.blue;
        expect(blue.rail).toContain("alloy-blue");
        expect(blue.rail).not.toContain("alloy-bend-pine");
        expect(PROCESS_CARD_ACCENT_LABELS.blue).toBe("Alloy Blue");
    });

    it("normalizes legacy juniper to blue (distinct from pine)", () => {
        expect(normalizeProcessCardAccent("juniper")).toBe("blue");
        expect(normalizeProcessCardAccent("pine")).toBe("pine");
    });

    it("workspaceHeaderKpiIconClass prefers accent over status", () => {
        expect(workspaceHeaderKpiIconClass({ accent: "gold", status: "healthy" })).toBe(
            PROCESS_CARD_ACCENT_STYLES.gold.metricText,
        );
        expect(workspaceHeaderKpiIconClass({ accent: null, status: "critical" })).toBe("text-alloy-ember");
    });
});
