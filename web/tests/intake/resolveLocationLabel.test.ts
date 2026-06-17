import { describe, expect, it, beforeEach } from "vitest";
import { resolveLocationLabelToOption } from "@/lib/intake/resolve/resolveLocationLabel";

describe("resolveLocationLabelToOption", () => {
    const options = [
        { value: "site-north", label: "North Campus" },
        { value: "site-south", label: "South Campus" },
        { value: "site-north-2", label: "North Campus Annex" },
    ];

    it("exact match resolves with high confidence", () => {
        const result = resolveLocationLabelToOption("North Campus", options);
        expect(result.validation_state).toBe("valid");
        expect(result.resolved_value).toBe("site-north");
        expect(result.resolved_label).toBe("North Campus");
        expect(result.confidence).toBe("high");
    });

    it("case-insensitive trimmed match", () => {
        const result = resolveLocationLabelToOption("  north campus  ", options);
        expect(result.resolved_value).toBe("site-north");
    });

    it("ambiguous when multiple fuzzy options match", () => {
        const result = resolveLocationLabelToOption("North Campus", [
            { value: "a", label: "North Campus Main" },
            { value: "b", label: "North Campus East" },
        ]);
        expect(result.validation_state).toBe("ambiguous");
        expect(result.resolved_value).toBeNull();
        expect(result.matching_option_values.length).toBeGreaterThan(1);
    });

    it("unknown when no match", () => {
        const result = resolveLocationLabelToOption("West Ridge", options);
        expect(result.validation_state).toBe("unknown");
        expect(result.resolved_value).toBeNull();
    });
});
