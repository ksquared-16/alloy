import { describe, expect, it } from "vitest";
import { __testing } from "@/lib/queues/QueueService";

describe("QueueService — customer_members → CRM compact children (pure helpers)", () => {
    const {
        buildCrmCompactStructuredLinesFromCustomerMembers,
        isActiveChildCustomerMemberRow,
        opportunityProgramLineFromMetadata,
        displayBaseNameForCustomerMember,
    } = __testing;

    function emptyPersonContext() {
        return {
            childDobByPersonId: new Map<string, string>(),
            personById: new Map<string, { date_of_birth?: string | null }>(),
        };
    }

    it("one active child → one structured row; secondary repeats opportunity program", () => {
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
            personById,
            "Preschool (3–4)"
        );
        expect(lines).toHaveLength(1);
        expect(lines[0]!.primary).toContain("Mia Chen");
        expect(lines[0]!.primary).toMatch(/\(/);
        expect(lines[0]!.secondary).toBe("Preschool (3–4)");
    });

    it("multiple children → multiple rows; same program on each line", () => {
        const { childDobByPersonId, personById } = emptyPersonContext();
        childDobByPersonId.set("p1", "2021-06-01");
        childDobByPersonId.set("p2", "2022-06-01");
        const lines = buildCrmCompactStructuredLinesFromCustomerMembers(
            [
                { customer_id: "c1", display_name: "Liam Patel", person_id: "p1", dob: "2021-06-01" },
                { customer_id: "c1", display_name: "Mia Patel", person_id: "p2", dob: "2022-06-01" },
            ],
            childDobByPersonId,
            personById,
            "Infant (6–12 mo)"
        );
        expect(lines).toHaveLength(2);
        expect(lines.every((l) => l.secondary === "Infant (6–12 mo)")).toBe(true);
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
                program_label: "Young Toddler (12–24 mo)",
                age_group: "12–24 mo",
            })
        ).toContain("Young Toddler");
    });

    it("program label only helper excludes age_group for per-child secondary", () => {
        expect(
            __testing.opportunityProgramLabelOnlyFromMetadata({
                program_label: "Infant (6–12 mo)",
                age_group: "6–12 mo",
            })
        ).toBe("Infant (6–12 mo)");
    });
});
