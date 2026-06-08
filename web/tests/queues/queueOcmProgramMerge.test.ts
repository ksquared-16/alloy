import { describe, expect, it } from "vitest";
import { resolveInquiryChildProgramCategoryLabel } from "@/lib/admin/drawer/inquiryChildOcmPlacementDisplay";
import { resolveQueueChildProgramCategoryLabel } from "@/lib/admin/drawer/queueOcmPlacementEnrichment";
import { __testing } from "@/lib/queues/QueueService";

describe("queue CRM compact program — OCM authoritative", () => {
    const { buildCrmCompactStructuredLinesFromCustomerMembers, mergeInquiryChildrenIntoMemberStructuredLines } =
        __testing;

    it("OCM toddler wins over member metadata program_label (Preschool — 3–4 years)", () => {
        const lookup = new Map([["childcare_program_type\0toddler", "Toddler"]]);
        const ocmByMemberId = new Map([
            [
                "cm-1",
                {
                    opportunity_id: "opp-1",
                    customer_member_id: "cm-1",
                    desired_program_type: "toddler",
                },
            ],
        ]);
        const lines = buildCrmCompactStructuredLinesFromCustomerMembers(
            [
                {
                    id: "cm-1",
                    customer_id: "cust-1",
                    display_name: "Lucas Murphy",
                    person_id: "p1",
                    dob: "2022-06-01",
                    metadata: { program_label: "Preschool — 3–4 years" },
                },
            ],
            new Map([["p1", "2022-06-01"]]),
            new Map(),
            {
                opportunityId: "opp-1",
                ocmByMemberId,
                optionLabelLookup: lookup,
            }
        );
        expect(lines[0]?.secondary).toBe("Toddler");
    });

    it("stale metadata.inquiry_children cannot override OCM member line via display-name merge", () => {
        const lookup = new Map([
            ["childcare_program_type\0toddler", "Toddler"],
            ["childcare_program_type\0preschool", "Preschool"],
        ]);
        const ocmByMemberId = new Map([
            [
                "cm-1",
                {
                    opportunity_id: "opp-1",
                    customer_member_id: "cm-1",
                    desired_program_type: "toddler",
                },
            ],
        ]);
        const lines = buildCrmCompactStructuredLinesFromCustomerMembers(
            [
                {
                    id: "cm-1",
                    customer_id: "cust-1",
                    display_name: "Lucas Murphy",
                    metadata: { program_label: "Preschool — 3–4 years" },
                },
            ],
            new Map(),
            new Map(),
            { opportunityId: "opp-1", ocmByMemberId, optionLabelLookup: lookup }
        );
        const merged = mergeInquiryChildrenIntoMemberStructuredLines(
            lines,
            [
                {
                    display_name: "Lucas Murphy",
                    program_label: "Preschool — 3–4 years",
                    desired_program_type: "preschool",
                },
            ],
            lookup,
            ocmByMemberId
        );
        expect(merged[0]?.secondary).toBe("Toddler");
    });

    it("demo_program_label does not override OCM desired_program_type when option map is empty", () => {
        expect(
            resolveInquiryChildProgramCategoryLabel({
                desired_program_type: "toddler",
                demo_program_label: "Preschool — 3–4 years",
                optionLabelLookup: new Map(),
            })
        ).toBe("toddler");
    });

    it("queue resolver uses OCM only when OCM row exists", () => {
        expect(
            resolveQueueChildProgramCategoryLabel({
                ocmRow: {
                    opportunity_id: "opp-1",
                    customer_member_id: "cm-1",
                    desired_program_type: "toddler",
                },
                optionLabelLookup: new Map([["childcare_program_type\0toddler", "Toddler"]]),
                metadataProgramLabel: "Preschool — 3–4 years",
            })
        ).toBe("Toddler");
    });
});
