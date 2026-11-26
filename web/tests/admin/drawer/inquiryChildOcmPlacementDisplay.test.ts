import { describe, expect, it } from "vitest";
import {
    applyInquiryChildPlacementDisplayLabels,
    inquiryChildPlacementOptionLabelPairs,
    resolveInquiryChildProgramCategoryLabel,
} from "@/lib/admin/drawer/inquiryChildOcmPlacementDisplay";
import { resolveQueueChildProgramCategoryLabel } from "@/lib/admin/drawer/queueOcmPlacementEnrichment";
import { resolvePersonDrawerChildPlacementFromRecord } from "@/lib/admin/person/personDrawerChildPlacementContext";

const CATEGORY_ID = "33333333-3333-4333-8333-333333333333";
const SITE_ID = "11111111-1111-4111-8111-111111111111";

const CATEGORIES = [
    {
        id: CATEGORY_ID,
        org_id: "org-1",
        location_id: SITE_ID,
        key: "toddler",
        label: "Toddler Program",
    },
];

describe("inquiryChildOcmPlacementDisplay", () => {
    it("resolves program/category label from the category FK", () => {
        expect(
            resolveInquiryChildProgramCategoryLabel({
                program_category_id: CATEGORY_ID,
                locationProgramCategories: CATEGORIES,
            })
        ).toBe("Toddler Program");
    });

    it("resolves label from derived program key via option lookup", () => {
        const lookup = new Map([["childcare_program_type\0toddler", "Toddler Program"]]);
        expect(
            resolveInquiryChildProgramCategoryLabel({
                program_key: "toddler",
                optionLabelLookup: lookup,
            })
        ).toBe("Toddler Program");
    });

    it("prefers server-provided desired_program_label when present", () => {
        const lookup = new Map([["childcare_program_type\0toddler", "Toddler Program"]]);
        expect(
            resolveInquiryChildProgramCategoryLabel({
                program_key: "toddler",
                desired_program_label: "Toddler (cached)",
                optionLabelLookup: lookup,
            })
        ).toBe("Toddler (cached)");
    });

    it("does not use demo_program_label when the OCM program is set", () => {
        expect(
            resolveInquiryChildProgramCategoryLabel({
                program_key: "toddler",
                demo_program_label: "Preschool — 3–4 years",
                optionLabelLookup: new Map(),
            })
        ).toBe("toddler");
    });

    it("returns null when OCM program category and derived key are absent", () => {
        expect(
            resolveInquiryChildProgramCategoryLabel({
                program_category_id: null,
                program_key: null,
                optionLabelLookup: new Map([["childcare_program_type\0toddler", "Toddler"]]),
            })
        ).toBeNull();
    });

    it("applyInquiryChildPlacementDisplayLabels aligns inquiry row labels with lookup", () => {
        const lookup = new Map([["childcare_program_type\0infant", "Infant"]]);
        const rows = applyInquiryChildPlacementDisplayLabels(
            [{ program_key: "infant", desired_program_label: null }],
            lookup
        );
        expect(rows[0]?.desired_program_label).toBe("Infant");
    });

    it("child drawer placement program_label matches inquiry resolver for same OCM key", () => {
        const lookup = new Map([["childcare_program_type\0preschool", "Preschool"]]);
        const inquiryLabel = resolveInquiryChildProgramCategoryLabel({
            program_key: "preschool",
            optionLabelLookup: lookup,
        });
        const childPlacement = resolvePersonDrawerChildPlacementFromRecord({
            _enrollment_mirror: [
                {
                    id: "ocm-1",
                    opportunity_id: "opp-1",
                    customer_member_id: "cm-1",
                    program_label: inquiryLabel,
                    location_label: "North",
                },
            ],
            _enrollment_opportunities: [{ id: "opp-1", name: "Lead" }],
        });
        expect(childPlacement.program_label).toBe("Preschool");
        expect(inquiryLabel).toBe("Preschool");
    });

    it("applyInquiryChildPlacementDisplayLabels uses derived key when label map is empty", () => {
        const rows = applyInquiryChildPlacementDisplayLabels(
            [{ program_key: "preschool", desired_program_label: null }],
            new Map()
        );
        expect(rows[0]?.desired_program_label).toBe("preschool");
    });

    it("queue and inquiry resolvers match for same OCM program category", () => {
        const lookup = new Map([["childcare_program_type\0infant", "Infant Room"]]);
        const label = resolveInquiryChildProgramCategoryLabel({
            program_key: "infant",
            optionLabelLookup: lookup,
        });
        const queueLabel = resolveQueueChildProgramCategoryLabel({
            ocmRow: {
                opportunity_id: "opp-1",
                customer_member_id: "cm-1",
                location_id: null,
                program_category_id: null,
                program_key: "infant",
                program_label: null,
            },
            optionLabelLookup: lookup,
        });
        expect(queueLabel).toBe("Infant Room");
        expect(label).toBe("Infant Room");
    });

    it("queue resolver prefers the embedded category label", () => {
        const queueLabel = resolveQueueChildProgramCategoryLabel({
            ocmRow: {
                opportunity_id: "opp-1",
                customer_member_id: "cm-1",
                location_id: SITE_ID,
                program_category_id: CATEGORY_ID,
                program_key: "toddler",
                program_label: "Toddler Program",
            },
            optionLabelLookup: new Map(),
        });
        expect(queueLabel).toBe("Toddler Program");
    });

    it("collects distinct placement option pairs for batch label fetch", () => {
        const pairs = inquiryChildPlacementOptionLabelPairs([
            { program_key: "a", schedule_type: "full", program_room_cohort_key: "room-1" },
            { program_key: "a", schedule_type: "full" },
        ]);
        expect(pairs).toHaveLength(3);
    });
});
