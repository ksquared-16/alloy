/**
 * Phase 7 — operator/participant language + valid-option contract for requirement responsibility.
 * Guards that the UI only ever offers meaningful combinations and never leaks raw enum values.
 */
import { describe, it, expect } from "vitest";
import {
    isInformationalOnly,
    partyLabel,
    partyOptions,
    requirementTypeLabel,
    responsibilitySummary,
    satisfactionLabel,
    validSatisfactions,
    validScopes,
} from "@/lib/pos/packet/requirementResponsibilityLabels";

describe("requirement responsibility labels", () => {
    it("renders human requirement-type labels", () => {
        expect(requirementTypeLabel("upload")).toBe("Document upload");
        expect(requirementTypeLabel("acknowledgement")).toBe("Acknowledgement");
        expect(requirementTypeLabel("signature")).toBe("Signature");
        expect(requirementTypeLabel("information")).toBe("Information");
    });

    it("marks presented content informational-only (not configurable)", () => {
        expect(isInformationalOnly("static_content")).toBe(true);
        expect(isInformationalOnly("upload")).toBe(false);
    });

    it("offers only meaningful scopes per type (uploads can be per-document; signatures cannot)", () => {
        expect(validScopes("upload")).toContain("document");
        expect(validScopes("signature")).not.toContain("document");
        expect(validScopes("signature")).toContain("child");
    });

    it("offers scope-appropriate satisfaction rules", () => {
        expect(validSatisfactions("child")).toContain("one_per_child");
        expect(validSatisfactions("document")).toContain("one_per_document");
        expect(validSatisfactions("household")).toContain("every_assigned_participant");
    });

    it("excludes specific-guardian from reusable-definition party options", () => {
        const kinds = partyOptions().map((o) => o.kind);
        expect(kinds).not.toContain("specific_guardian");
        expect(kinds).toContain("financial_guardian");
        expect(kinds).toContain("either_guardian");
    });

    it("summarizes responsibility in plain language", () => {
        expect(responsibilitySummary({ applies_to: "child", responsible_party: { kind: "either_guardian" }, satisfied_by: "one_per_child" })).toBe(
            "Either guardian · Once for each child"
        );
        expect(partyLabel({ kind: "role", role: "Notary" })).toBe("Role: Notary");
        expect(satisfactionLabel("every_assigned_participant")).toBe("Every responsible person completes it");
    });
});
