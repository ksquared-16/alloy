import { describe, expect, it } from "vitest";
import { resolveChildAgeDisplayLabel } from "@/lib/admin/drawer/childAgeDisplay";
import { __testing } from "@/lib/queues/QueueService";

describe("QueueService — customer_members → CRM compact children (pure helpers)", () => {
    const {
        buildCrmCompactStructuredLinesFromCustomerMembers,
        isActiveChildCustomerMemberRow,
        opportunityProgramLineFromMetadata,
        displayBaseNameForCustomerMember,
    } = __testing;

    function emptyPlacementContext() {
        return {
            opportunityId: "opp-1",
            ocmByMemberId: new Map(),
            optionLabelLookup: new Map<string, string>(),
            locationProgramCategories: [] as const,
        };
    }

    function emptyPersonContext() {
        return {
            childDobByPersonId: new Map<string, string>(),
            personById: new Map<string, { date_of_birth?: string | null }>(),
        };
    }

    it("one active child → primary includes canonical age from Person DOB", () => {
        const { childDobByPersonId, personById } = emptyPersonContext();
        childDobByPersonId.set("p1", "2024-01-22");
        const lines = buildCrmCompactStructuredLinesFromCustomerMembers(
            [
                {
                    id: "cm-1",
                    customer_id: "cust-1",
                    display_name: "Mia Chen",
                    person_id: "p1",
                    dob: "2024-01-22",
                },
            ],
            childDobByPersonId,
            personById,
            emptyPlacementContext()
        );
        expect(lines).toHaveLength(1);
        const age = resolveChildAgeDisplayLabel({
            person_id: "p1",
            person_date_of_birth: "2024-01-22",
        });
        expect(lines[0]!.primary).toContain("Mia Chen");
        expect(lines[0]!.primary).toContain(age);
    });

    it("secondary uses OCM program key (not DOB-derived mock program)", () => {
        const lookup = new Map([["childcare_program_type\0toddler", "Toddler"]]);
        const ctx = {
            opportunityId: "opp-1",
            ocmByMemberId: new Map([
                [
                    "cm-1",
                    {
                        opportunity_id: "opp-1",
                        customer_member_id: "cm-1",
                        program_key: "toddler",
                        location_id: null,
                        program_category_id: null,
                        program_label: null,
                    },
                ],
            ]),
            optionLabelLookup: lookup,
            locationProgramCategories: [] as const,
        };
        const lines = buildCrmCompactStructuredLinesFromCustomerMembers(
            [
                {
                    id: "cm-1",
                    customer_id: "c1",
                    display_name: "Test Child",
                    person_id: "p9",
                    dob: "2021-06-01",
                },
            ],
            emptyPersonContext().childDobByPersonId,
            emptyPersonContext().personById,
            ctx
        );
        expect(lines[0]!.secondary).toBe("Toddler");
    });

    it("secondary is null when OCM program type is absent", () => {
        const lines = buildCrmCompactStructuredLinesFromCustomerMembers(
            [
                {
                    id: "cm-1",
                    customer_id: "c1",
                    display_name: "Test Child",
                    person_id: "p9",
                    dob: "2021-06-01",
                },
            ],
            emptyPersonContext().childDobByPersonId,
            emptyPersonContext().personById,
            emptyPlacementContext()
        );
        expect(lines[0]!.secondary).toBeNull();
    });

    it("prefers member metadata program_label only when OCM has no program category", () => {
        const lines = buildCrmCompactStructuredLinesFromCustomerMembers(
            [
                {
                    id: "cm-1",
                    customer_id: "c1",
                    display_name: "Test Child",
                    metadata: { program_label: "Legacy Preschool" },
                },
            ],
            emptyPersonContext().childDobByPersonId,
            emptyPersonContext().personById,
            emptyPlacementContext()
        );
        expect(lines[0]!.secondary).toBe("Legacy Preschool");
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
