import { describe, expect, it } from "vitest";
import {
    applyInquiryChildPlacementDisplayLabels,
    inquiryChildPlacementOptionLabelPairs,
    resolveInquiryChildProgramCategoryLabel,
} from "@/lib/admin/drawer/inquiryChildOcmPlacementDisplay";
import { resolveQueueChildProgramCategoryLabel } from "@/lib/admin/drawer/queueOcmPlacementEnrichment";
import { resolvePersonDrawerChildPlacementFromRecord } from "@/lib/admin/person/personDrawerChildPlacementContext";

describe("inquiryChildOcmPlacementDisplay", () => {
    it("resolves program/category from OCM desired_program_type and option lookup", () => {
        const lookup = new Map([["childcare_program_type\0toddler", "Toddler Program"]]);
        expect(
            resolveInquiryChildProgramCategoryLabel({
                desired_program_type: "toddler",
                optionLabelLookup: lookup,
            })
        ).toBe("Toddler Program");
    });

    it("prefers server-provided desired_program_label when present", () => {
        const lookup = new Map([["childcare_program_type\0toddler", "Toddler Program"]]);
        expect(
            resolveInquiryChildProgramCategoryLabel({
                desired_program_type: "toddler",
                desired_program_label: "Toddler (cached)",
                optionLabelLookup: lookup,
            })
        ).toBe("Toddler (cached)");
    });

    it("does not use demo_program_label when OCM desired_program_type is set", () => {
        expect(
            resolveInquiryChildProgramCategoryLabel({
                desired_program_type: "toddler",
                demo_program_label: "Preschool — 3–4 years",
                optionLabelLookup: new Map(),
            })
        ).toBe("toddler");
    });

    it("returns null when OCM program type is absent", () => {
        expect(
            resolveInquiryChildProgramCategoryLabel({
                desired_program_type: null,
                optionLabelLookup: new Map([["childcare_program_type\0toddler", "Toddler"]]),
            })
        ).toBeNull();
    });

    it("applyInquiryChildPlacementDisplayLabels aligns inquiry row labels with lookup", () => {
        const lookup = new Map([["childcare_program_type\0infant", "Infant"]]);
        const rows = applyInquiryChildPlacementDisplayLabels(
            [{ desired_program_type: "infant", desired_program_label: null }],
            lookup
        );
        expect(rows[0]?.desired_program_label).toBe("Infant");
    });

    it("child drawer placement program_label matches inquiry resolver for same OCM key", () => {
        const lookup = new Map([["childcare_program_type\0preschool", "Preschool"]]);
        const inquiryLabel = resolveInquiryChildProgramCategoryLabel({
            desired_program_type: "preschool",
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

    it("applyInquiryChildPlacementDisplayLabels uses type key when label map is empty", () => {
        const rows = applyInquiryChildPlacementDisplayLabels(
            [{ desired_program_type: "preschool", desired_program_label: null }],
            new Map()
        );
        expect(rows[0]?.desired_program_label).toBe("preschool");
    });

    it("queue and inquiry resolvers match for same OCM desired_program_type", () => {
        const lookup = new Map([["childcare_program_type\0infant", "Infant Room"]]);
        const label = resolveInquiryChildProgramCategoryLabel({
            desired_program_type: "infant",
            optionLabelLookup: lookup,
        });
        const queueLabel = resolveQueueChildProgramCategoryLabel({
            ocmRow: {
                opportunity_id: "opp-1",
                customer_member_id: "cm-1",
                desired_program_type: "infant",
                location_id: null,
                desired_program_category_id: null,
            },
            optionLabelLookup: lookup,
        });
        expect(queueLabel).toBe("Infant Room");
        expect(label).toBe("Infant Room");
    });

    it("collects distinct placement option pairs for batch label fetch", () => {
        const pairs = inquiryChildPlacementOptionLabelPairs([
            { desired_program_type: "a", desired_schedule_type: "full", program_room_cohort_key: "room-1" },
            { desired_program_type: "a", desired_schedule_type: "full" },
        ]);
        expect(pairs).toHaveLength(3);
    });
});
