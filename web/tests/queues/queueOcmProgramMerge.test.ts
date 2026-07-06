import { describe, expect, it } from "vitest";
import { resolveInquiryChildProgramCategoryLabel } from "@/lib/admin/drawer/inquiryChildOcmPlacementDisplay";
import { resolveQueueChildProgramCategoryLabel } from "@/lib/admin/drawer/queueOcmPlacementEnrichment";
import { __testing } from "@/lib/queues/QueueService";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";

const SITE_ID = "site-north";
const LOCATION_CATEGORIES: LocationProgramCategoryRow[] = [
    {
        id: "cat-toddler",
        org_id: "org-1",
        location_id: SITE_ID,
        key: "toddler",
        label: "Toddler Care",
        sort_order: 20,
        is_active: true,
    },
];

describe("queue CRM compact program — OCM authoritative", () => {
    const { buildCrmCompactStructuredLinesFromCustomerMembers, mergeInquiryChildrenIntoMemberStructuredLines } =
        __testing;

    const baseCtx = {
        opportunityId: "opp-1",
        optionLabelLookup: new Map([["childcare_program_type\0toddler", "Toddler"]]),
        locationProgramCategories: LOCATION_CATEGORIES,
    };

    it("OCM toddler wins over member metadata program_label (Preschool — 3–4 years)", () => {
        const ocmByMemberId = new Map([
            [
                "cm-1",
                {
                    opportunity_id: "opp-1",
                    customer_member_id: "cm-1",
                    location_id: SITE_ID,
                    program_key: "toddler",
                    program_category_id: "cat-toddler",
                    program_label: "Toddler Care",
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
            { ...baseCtx, ocmByMemberId }
        );
        expect(lines[0]?.secondary).toBe("Toddler Care");
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
                    location_id: SITE_ID,
                    program_key: "toddler",
                    program_category_id: "cat-toddler",
                    program_label: "Toddler Care",
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
            {
                opportunityId: "opp-1",
                ocmByMemberId,
                optionLabelLookup: lookup,
                locationProgramCategories: LOCATION_CATEGORIES,
            }
        );
        const merged = mergeInquiryChildrenIntoMemberStructuredLines(
            lines,
            [
                {
                    display_name: "Lucas Murphy",
                    program_label: "Preschool — 3–4 years",
                    program_key: "preschool",
                },
            ],
            lookup,
            ocmByMemberId,
            LOCATION_CATEGORIES
        );
        expect(merged[0]?.secondary).toBe("Toddler Care");
    });

    it("demo_program_label does not override OCM program key when option map is empty", () => {
        expect(
            resolveInquiryChildProgramCategoryLabel({
                program_key: "toddler",
                demo_program_label: "Preschool — 3–4 years",
                optionLabelLookup: new Map(),
            })
        ).toBe("toddler");
    });

    it("queue resolver prefers location category label over legacy option set", () => {
        expect(
            resolveQueueChildProgramCategoryLabel({
                ocmRow: {
                    opportunity_id: "opp-1",
                    customer_member_id: "cm-1",
                    location_id: SITE_ID,
                    program_key: "toddler",
                    program_category_id: "cat-toddler",
                    program_label: "Toddler Care",
                },
                optionLabelLookup: new Map([["childcare_program_type\0toddler", "Toddler"]]),
                locationProgramCategories: LOCATION_CATEGORIES,
                metadataProgramLabel: "Preschool — 3–4 years",
            })
        ).toBe("Toddler Care");
    });
});
