import { describe, expect, it } from "vitest";
import { buildApprovalResultView, type CommittedRecordIds } from "@/lib/pos/approvalResultPresentation";
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

const fullRecords: CommittedRecordIds = {
    household: "h1",
    child: "c1",
    person: "p1",
    lead: "l1",
    participation: "pp1",
};

function cardsFor(recommendation: IntakeRecommendation) {
    return buildMatchedRecords({ recommendation, intent: "enrollment_lead", submitted });
}

describe("approvalResultPresentation (§5)", () => {
    it("existing parent + new child: Linked parent + household, Created child/lead/participation, Updated ZIP", () => {
        const recommendation = rec({
            decision: "link",
            matchedOn: ["email"],
            candidates: [{ entityType: "person", id: "p1", label: "Marisol Ziptest", matchReason: "parent email" }],
            recommendedCandidateId: "p1",
        });
        const view = buildApprovalResultView({
            cards: cardsFor(recommendation),
            // On a link there is no create_person op — person stays null; lead references the linked parent.
            records: { ...fullRecords, person: null },
            linkedParentName: "Marisol Ziptest",
            linkedHouseholdName: "Ziptest",
            submittedZip: "97701",
        });

        expect(view.linked.map((l) => l.primary)).toContain("Marisol Ziptest");
        expect(view.linked.some((l) => /Existing Ziptest household/.test(l.primary))).toBe(true);
        expect(view.created.map((l) => l.primary)).toEqual(expect.arrayContaining(["Wren Ziptest", "Enrollment lead", "Enrollment participation"]));
        expect(view.updated.map((l) => l.primary)).toContain("ZIP Code: 97701");
        // Parent was linked, not created.
        expect(view.created.some((l) => l.primary === "Marisol Ziptest")).toBe(false);
        // Human language only.
        expect(JSON.stringify(view)).not.toMatch(/opportunity|person_id|customer_member|CRM|h1|c1|l1|pp1/i);
    });

    it("new family: everything under Created, nothing Linked", () => {
        const recommendation = rec({ decision: "create" });
        const view = buildApprovalResultView({
            cards: cardsFor(recommendation),
            records: fullRecords,
            submittedZip: "97701",
        });
        expect(view.linked).toHaveLength(0);
        expect(view.created.map((l) => l.primary)).toEqual(expect.arrayContaining(["Marisol Ziptest", "Wren Ziptest", "Enrollment lead", "Enrollment participation"]));
        expect(view.updated.map((l) => l.primary)).toContain("ZIP Code: 97701");
    });

    it("honest: no created line for records that were not committed, no ZIP line without a ZIP", () => {
        const recommendation = rec({ decision: "create" });
        const view = buildApprovalResultView({
            cards: cardsFor(recommendation),
            // Only the parent committed; child/lead/participation did not.
            records: { household: "h1", child: null, person: "p1", lead: null, participation: null },
            submittedZip: null,
        });
        expect(view.created.map((l) => l.primary)).toContain("Marisol Ziptest");
        expect(view.created.some((l) => l.primary === "Wren Ziptest")).toBe(false);
        expect(view.created.some((l) => l.primary === "Enrollment lead")).toBe(false);
        expect(view.updated).toHaveLength(0);
    });

    it("non-lead handoff (no records) yields an empty result view", () => {
        const recommendation = rec({ decision: "create" });
        const view = buildApprovalResultView({ cards: cardsFor(recommendation), records: null, submittedZip: "97701" });
        expect(view.isEmpty).toBe(true);
    });
});
