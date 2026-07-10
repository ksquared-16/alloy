import { describe, expect, it } from "vitest";

import { resolveCurrentWorkFieldRuleDisplayLabel } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkFieldRuleDisplayLabel";

describe("resolveCurrentWorkFieldRuleDisplayLabel", () => {
    it("uses published catalog field labels when available", () => {
        expect(resolveCurrentWorkFieldRuleDisplayLabel("child:first_name")).toBe("First Name");
    });

    it("never exposes canonical custom field keys", () => {
        const label = resolveCurrentWorkFieldRuleDisplayLabel("custom:opportunity:schools");
        expect(label).toBe("Schools");
        expect(label).not.toContain("custom:");
        expect(label).not.toContain("opportunity");
    });

    it("falls back to friendly token labels for unknown rule ids", () => {
        expect(resolveCurrentWorkFieldRuleDisplayLabel("person:preferred_contact_method")).toBe(
            "Preferred Contact Method",
        );
    });
});
