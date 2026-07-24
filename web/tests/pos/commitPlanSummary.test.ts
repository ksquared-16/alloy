import { describe, expect, it } from "vitest";
import { buildCommitPlanLines } from "@/lib/pos/commitPlanSummary";
import { buildMatchedRecords } from "@/lib/pos/matchedRecordsPresentation";
import type { IntakeRecommendation } from "@/lib/forms/intake/resolveIntakeIdentity";

function rec(partial: Partial<IntakeRecommendation>): IntakeRecommendation {
    return {
        decision: "create",
        confidence: "medium",
        proposed: { person: { email: "marisol.ziptest@example.invalid", phone: null, firstName: "Marisol", lastName: "Ziptest" } },
        candidates: [],
        matchedOn: [],
        blockers: [],
        ...partial,
    };
}

const submitted = [
    { label: "Parent first name", value: "Marisol" },
    { label: "Parent last name", value: "Ziptest" },
    { label: "Zip Code", value: "97701" },
    { label: "Child first name", value: "Wren" },
    { label: "Child last name", value: "Ziptest" },
    { label: "Child date of birth", value: "2023-03-02" },
];

function planFor(recommendation: IntakeRecommendation) {
    return buildCommitPlanLines(buildMatchedRecords({ recommendation, intent: "enrollment_lead", submitted }));
}

describe("commitPlanSummary (§2)", () => {
    it("link decision → link the existing parent, create the new child, attach the enrollment lead", () => {
        const lines = planFor(
            rec({ decision: "link", matchedOn: ["email"], candidates: [{ entityType: "person", id: "x", label: "X", matchReason: "parent email" }], recommendedCandidateId: "x" })
        );
        const texts = lines.map((l) => l.text);
        expect(texts).toContain("Link Marisol Ziptest");
        expect(texts).toContain("Create Wren Ziptest as a new child");
        expect(texts).toContain("Create or attach the enrollment lead");
        // No engine/table/id vocabulary leaks into the rail.
        expect(JSON.stringify(lines)).not.toMatch(/CRM|opportunity_id|person_id|entity|customer_member/i);
    });

    it("create decision → create the parent, create the child, create the enrollment lead", () => {
        const lines = planFor(rec({ decision: "create" }));
        const texts = lines.map((l) => l.text);
        expect(texts).toContain("Create Marisol Ziptest");
        expect(texts).toContain("Create Wren Ziptest as a new child");
        expect(texts).toContain("Create or attach the enrollment lead");
    });

    it("route decision → nothing is created; parent + business object read as review", () => {
        const lines = planFor(rec({ decision: "route", blockers: ["ambiguous_email"] }));
        expect(lines.find((l) => l.text.includes("Resolve the parent match"))?.tone).toBe("review");
        expect(lines.some((l) => l.tone === "review" && /nothing is created yet/.test(l.text))).toBe(true);
        expect(lines.some((l) => l.tone === "create" && /parent|enrollment lead/.test(l.text))).toBe(false);
    });
});
