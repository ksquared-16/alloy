import { describe, expect, it } from "vitest";
import {
    inquiryChildPlacementMetadataForRefKey,
    layoutRefKeyForInquiryChildOcmField,
} from "@/lib/fields/inquiryChildPlacementFieldMetadata";
import { resolveLayoutRuntimeFieldControl } from "@/lib/layout/runtime/resolveLayoutRuntimeFieldControl";

describe("inquiryChildPlacementFieldMetadata", () => {
    it("maps inquiry_child placement refKeys to cascade option sources", () => {
        expect(inquiryChildPlacementMetadataForRefKey("inquiry_child.location_id")?.option_source).toBe("locations");
        expect(inquiryChildPlacementMetadataForRefKey("inquiry_child.program_category_id")?.option_source).toBe(
            "programs_for_location",
        );
        expect(inquiryChildPlacementMetadataForRefKey("inquiry_child.program_room_cohort_key")?.option_source).toBe(
            "rooms_for_location_program",
        );
        expect(inquiryChildPlacementMetadataForRefKey("child.program")?.option_source).toBe("programs_for_location");
    });

    it("room cascade depends on program category", () => {
        expect(
            inquiryChildPlacementMetadataForRefKey("inquiry_child.program_room_cohort_key")?.depends_on_field_key,
        ).toBe("program_category_id");
    });

    it("builds canonical layout refKeys for native OCM fields", () => {
        expect(layoutRefKeyForInquiryChildOcmField("program_category_id")).toBe("inquiry_child.program_category_id");
    });
});

describe("resolveLayoutRuntimeFieldControl", () => {
    it("resolves program as location-scoped select not text", () => {
        const r = resolveLayoutRuntimeFieldControl("inquiry_child.program_category_id");
        expect(r.controlType).toBe("select");
        expect(r.option_source).toBe("programs_for_location");
        expect(r.depends_on_field_key).toBe("location_id");
    });

    it("resolves schedule as option_set select", () => {
        const r = resolveLayoutRuntimeFieldControl("inquiry_child.schedule_type");
        expect(r.controlType).toBe("select");
        expect(r.option_source).toBe("option_set");
        expect(r.option_set_key).toBe("childcare_schedule_type");
    });
});
