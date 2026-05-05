import { describe, expect, it } from "vitest";
import { __testing } from "@/lib/queues/QueueService";
import { approximateAgeMonthsFromDobIso, programLabelAndAgeGroupFromAgeMonths } from "@/lib/childcare/childCareProgramFromDob";

describe("QueueService — customer_members → CRM compact children (pure helpers)", () => {
    const {
        buildCrmCompactStructuredLinesFromCustomerMembers,
        isActiveChildCustomerMemberRow,
        opportunityProgramLineFromMetadata,
        displayBaseNameForCustomerMember,
    } = __testing;

    const fixedNow = new Date("2026-06-01T12:00:00.000Z");

    function emptyPersonContext() {
        return {
            childDobByPersonId: new Map<string, string>(),
            personById: new Map<string, { date_of_birth?: string | null }>(),
        };
    }

    function secondaryFromDob(dob: string): string {
        const months = approximateAgeMonthsFromDobIso(dob, fixedNow) ?? 0;
        const t = programLabelAndAgeGroupFromAgeMonths(months);
        return t.age_group ? `${t.program_label} · ${t.age_group}` : t.program_label;
    }

    it("one active child → one structured row; secondary from DOB-derived program", () => {
        const { childDobByPersonId, personById } = emptyPersonContext();
        childDobByPersonId.set("p1", "2024-01-22");
        const lines = buildCrmCompactStructuredLinesFromCustomerMembers(
            [
                {
                    customer_id: "cust-1",
                    display_name: "Mia Chen",
                    person_id: "p1",
                    dob: "2024-01-22",
                },
            ],
            childDobByPersonId,
            personById
        );
        expect(lines).toHaveLength(1);
        expect(lines[0]!.primary).toContain("Mia Chen");
        expect(lines[0]!.primary).toMatch(/\(/);
        expect(lines[0]!.secondary).toBe(secondaryFromDob("2024-01-22"));
    });

    it("multiple children → multiple rows; per-child program when ages differ", () => {
        const { childDobByPersonId, personById } = emptyPersonContext();
        childDobByPersonId.set("p1", "2021-03-10");
        childDobByPersonId.set("p2", "2024-03-10");
        const lines = buildCrmCompactStructuredLinesFromCustomerMembers(
            [
                { customer_id: "c1", display_name: "Liam Patel", person_id: "p1", dob: "2021-03-10" },
                { customer_id: "c1", display_name: "Mia Patel", person_id: "p2", dob: "2024-03-10" },
            ],
            childDobByPersonId,
            personById
        );
        expect(lines).toHaveLength(2);
        const sec0 = secondaryFromDob("2021-03-10");
        const sec1 = secondaryFromDob("2024-03-10");
        expect(lines.map((l) => l.secondary).sort().join("|")).toBe([sec0, sec1].sort().join("|"));
        expect(sec0).not.toEqual(sec1);
    });

    it("prefers member metadata program when present (drawer-saved values)", () => {
        const { childDobByPersonId, personById } = emptyPersonContext();
        const lines = buildCrmCompactStructuredLinesFromCustomerMembers(
            [
                {
                    customer_id: "c1",
                    display_name: "Test Child",
                    person_id: "p9",
                    dob: "2021-06-01",
                    metadata: { program_label: "Preschool — 3–4 years", age_group: "Ages 36–48 mo" },
                },
            ],
            childDobByPersonId,
            personById
        );
        expect(lines).toHaveLength(1);
        expect(lines[0]!.secondary).toBe("Preschool — 3–4 years");
    });

    it("ignores non-child relationship rows (filter predicate)", () => {
        expect(isActiveChildCustomerMemberRow({ relationship: "guardian", is_active: true })).toBe(false);
        expect(isActiveChildCustomerMemberRow({ relationship: "Child", is_active: true })).toBe(true);
    });

    it("ignores inactive children", () => {
        expect(isActiveChildCustomerMemberRow({ relationship: "child", is_active: false })).toBe(false);
    });

    it("display name falls back to first + last", () => {
        expect(
            displayBaseNameForCustomerMember({
                customer_id: "c1",
                display_name: "",
                first_name: "Sophia",
                last_name: "Nguyen",
            })
        ).toBe("Sophia Nguyen");
    });

    it("opportunityProgramLineFromMetadata uses program_label (+ optional age_group)", () => {
        expect(
            opportunityProgramLineFromMetadata({
                program_label: "Young Toddler — 18–24 months",
                age_group: "",
            })
        ).toContain("Young Toddler");
    });

    it("program label only helper excludes age_group for per-child secondary", () => {
        expect(
            __testing.opportunityProgramLabelOnlyFromMetadata({
                program_label: "Infant — 0–18 months",
                age_group: "",
            })
        ).toBe("Infant — 0–18 months");
    });
});
