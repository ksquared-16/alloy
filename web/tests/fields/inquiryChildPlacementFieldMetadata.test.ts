import { describe, expect, it } from "vitest";
import {
    inquiryChildPlacementMetadataForRefKey,
    layoutRefKeyForInquiryChildOcmField,
} from "@/lib/fields/inquiryChildPlacementFieldMetadata";
import { resolveLayoutRuntimeFieldControl } from "@/lib/layout/runtime/resolveLayoutRuntimeFieldControl";

describe("inquiryChildPlacementFieldMetadata", () => {
    it("maps inquiry_child placement refKeys to cascade option sources", () => {
        expect(inquiryChildPlacementMetadataForRefKey("inquiry_child.location_id")?.option_source).toBe("locations");
        expect(inquiryChildPlacementMetadataForRefKey("inquiry_child.desired_program_type")?.option_source).toBe(
            "programs_for_location",
        );
        expect(inquiryChildPlacementMetadataForRefKey("inquiry_child.program_room_cohort_key")?.option_source).toBe(
            "rooms_for_location_program",
        );
        expect(inquiryChildPlacementMetadataForRefKey("child.program")?.option_source).toBe("programs_for_location");
    });

    it("normalizes legacy child.program alias to program placement metadata", () => {
        expect(layoutRefKeyForInquiryChildOcmField("desired_program_type")).toBe("inquiry_child.desired_program_type");
    });
});

describe("resolveLayoutRuntimeFieldControl", () => {
    it("resolves program as location-scoped select not text", () => {
        const r = resolveLayoutRuntimeFieldControl("inquiry_child.desired_program_type");
        expect(r.controlType).toBe("select");
        expect(r.option_source).toBe("programs_for_location");
        expect(r.depends_on_field_key).toBe("location_id");
    });

    it("resolves schedule as option_set select", () => {
        const r = resolveLayoutRuntimeFieldControl("inquiry_child.desired_schedule_type");
        expect(r.controlType).toBe("select");
        expect(r.option_source).toBe("option_set");
        expect(r.option_set_key).toBe("childcare_schedule_type");
    });
});
