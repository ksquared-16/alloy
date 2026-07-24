import { describe, expect, it } from "vitest";
import { buildMatchedRecords } from "@/lib/pos/matchedRecordsPresentation";
import type { IntakeRecommendation } from "@/lib/forms/intake/resolveIntakeIdentity";

function rec(partial: Partial<IntakeRecommendation>): IntakeRecommendation {
    return {
        decision: "create",
        confidence: "medium",
        proposed: { person: { email: "bart.thistlewood@example.invalid", phone: null, firstName: "Bartholomew", lastName: "Thistlewood" } },
        candidates: [],
        matchedOn: [],
        blockers: [],
        ...partial,
    };
}

const submitted = [
    { label: "Parent first name", value: "Bartholomew" },
    { label: "Parent last name", value: "Thistlewood" },
    { label: "Zip Code", value: "97703" },
    { label: "Child first name", value: "Marigold" },
    { label: "Child last name", value: "Thistlewood" },
    { label: "Child date of birth", value: "2022-08-14" },
];

describe("matchedRecordsPresentation (§4)", () => {
    it("renders Parent / Child / Enrollment lead in human language — no taxonomy or system vocab", () => {
        const cards = buildMatchedRecords({ recommendation: rec({ decision: "create" }), intent: "enrollment_lead", submitted });
        const blob = JSON.stringify(cards);
        expect(blob).not.toMatch(/CRM|guardian|customer_member|\bPerson\b|entity_type/i);

        const parent = cards.find((c) => c.role === "parent")!;
        expect(parent.title).toBe("Parent");
        expect(parent.name).toBe("Bartholomew Thistlewood");
        expect(parent.details).toContain("bart.thistlewood@example.invalid");

        const child = cards.find((c) => c.role === "child")!;
        expect(child.title).toBe("Child");
        expect(child.name).toBe("Marigold Thistlewood");
        expect(child.details.join(" ")).toMatch(/Born Aug 14, 2022/);

        const lead = cards.find((c) => c.role === "business_object")!;
        expect(lead.title).toBe("Enrollment lead");
    });

    it("states the real match basis for a linked parent (exact email), not a fabricated one", () => {
        const cards = buildMatchedRecords({
            recommendation: rec({ decision: "link", matchedOn: ["email"], candidates: [{ entityType: "person", id: "x", label: "X", matchReason: "parent email" }] }),
            intent: "enrollment_lead",
            submitted,
        });
        const parent = cards.find((c) => c.role === "parent")!;
        expect(parent.basis).toBe("Matched by exact email");
        expect(parent.basisTone).toBe("match");
        const lead = cards.find((c) => c.role === "business_object")!;
        expect(lead.basis).toBe("Will be linked after approval");
    });

    it("presents a child as a NEW record (person spine does not match children — no invented match)", () => {
        const cards = buildMatchedRecords({ recommendation: rec({ decision: "create" }), intent: "enrollment_lead", submitted });
        const child = cards.find((c) => c.role === "child")!;
        expect(child.basis).toBe("New child record");
        expect(child.basisTone).toBe("new");
    });

    it("uses the configured business object noun (waitlist → Waitlist opportunity)", () => {
        const cards = buildMatchedRecords({ recommendation: rec({ decision: "create" }), intent: "waitlist", submitted });
        expect(cards.find((c) => c.role === "business_object")!.title).toBe("Waitlist opportunity");
    });
});
