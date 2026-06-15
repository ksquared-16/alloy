import { describe, expect, it } from "vitest";
import {
    applyInquiryChildPlacementFieldChange,
    inquiryChildPlacementRoleForFieldKey,
} from "@/lib/admin/location/inquiryChildPlacementFieldKeys";
import { resolveProgramKeyForRoomCascade } from "@/lib/admin/location/inquiryChildLocationMismatch";
import {
    resolveRoomsForSiteAndProgram,
    type InquiryChildPlacementHierarchyRow,
} from "@/lib/admin/location/inquiryChildPlacementOptions";
import { buildInquiryChildRoomOptionsForSite } from "@/lib/admin/drawer/inquiryChildPlacementScope";
import {
    validateSelectLikeConfig,
    shouldIncludeConfigOnFieldDefinitionPatch,
    mergeFieldDefinitionConfigForWrite,
} from "@/lib/fields/fieldDefinitionConfig";
import { inquiryChildPlacementMetadataForRefKey } from "@/lib/fields/inquiryChildPlacementFieldMetadata";
import { resolveLayoutRuntimeEnrollmentPlacementContext } from "@/lib/layout/runtime/resolveLayoutRuntimeEnrollmentPlacementContext";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";

const LEAD_LOCATION_CONFIG = {
    operator_catalog_class: "operator_configurable",
    option_source: "locations",
    field_kind: "entity_reference",
    target_entity_type: "location",
    storage_class: "native_column",
    storage_table: "opportunities",
    storage_column: "location_id",
};

const CATEGORIES: LocationProgramCategoryRow[] = [
    {
        id: "cat-infant",
        org_id: "org-1",
        location_id: "site-north",
        key: "infant",
        label: "Infant",
        sort_order: 1,
        is_active: true,
    },
];

const HIERARCHY: InquiryChildPlacementHierarchyRow[] = [
    { id: "site-north", label: "North", location_type: "site", parent_location_id: null, is_active: true },
    {
        id: "room-infant-a",
        label: "Infant A",
        location_type: "unit",
        parent_location_id: "site-north",
        is_active: true,
        metadata: { category: "infant" },
    },
    {
        id: "room-preschool-a",
        label: "Preschool A",
        location_type: "unit",
        parent_location_id: "site-north",
        is_active: true,
        metadata: { category: "preschool" },
    },
];

describe("placement foundation — field validation", () => {
    it("accepts lead school reference with option_source", () => {
        expect(validateSelectLikeConfig("select", LEAD_LOCATION_CONFIG)).toEqual({ ok: true });
    });

    it("label-only PATCH on option_source select succeeds", () => {
        const merged = mergeFieldDefinitionConfigForWrite(LEAD_LOCATION_CONFIG, {});
        expect(validateSelectLikeConfig("select", merged)).toEqual({ ok: true });
        expect(
            shouldIncludeConfigOnFieldDefinitionPatch({
                fieldType: "select",
                existingConfig: LEAD_LOCATION_CONFIG,
                optionSetKey: "",
            }),
        ).toBe(false);
    });
});

describe("placement foundation — cascade metadata", () => {
    it("room depends on desired_program_category_id", () => {
        const meta = inquiryChildPlacementMetadataForRefKey("inquiry_child.program_room_cohort_key");
        expect(meta?.depends_on_field_key).toBe("desired_program_category_id");
        expect(meta?.option_source).toBe("rooms_for_location_program");
    });

    it("program category metadata is location-scoped", () => {
        const meta = inquiryChildPlacementMetadataForRefKey("inquiry_child.desired_program_category_id");
        expect(meta?.option_source).toBe("programs_for_location");
        expect(meta?.depends_on_field_key).toBe("location_id");
    });
});

describe("placement foundation — room cascade", () => {
    it("resolves program filter key from category id when type is empty", () => {
        expect(
            resolveProgramKeyForRoomCascade({
                desired_program_category_id: "cat-infant",
                desired_program_type: "",
                categories: CATEGORIES,
            }),
        ).toBe("infant");
    });

    it("falls back to desired_program_type when category id absent", () => {
        expect(
            resolveProgramKeyForRoomCascade({
                desired_program_category_id: "",
                desired_program_type: "preschool",
                categories: CATEGORIES,
            }),
        ).toBe("preschool");
    });

    it("filters room options by school and program category key", () => {
        const rooms = resolveRoomsForSiteAndProgram(HIERARCHY, "site-north", "infant");
        expect(rooms.map((r) => r.value)).toEqual(["room-infant-a"]);
        expect(rooms[0]?.label).toBe("Infant A");
    });

    it("room picker value is locations.id unit reference", () => {
        const options = buildInquiryChildRoomOptionsForSite(HIERARCHY, "site-north", "infant");
        expect(options).toEqual([{ cohort_key: "room-infant-a", label: "Infant A" }]);
        expect(options[0]?.cohort_key).toMatch(/^room-/);
    });
});

describe("placement foundation — lead vs child school", () => {
    it("layout runtime uses child school over lead anchor for cascade context", () => {
        const ctx = resolveLayoutRuntimeEnrollmentPlacementContext(
            { "inquiry_child.location_id": "child-site-b" },
            { "opportunity.location_id": "lead-site-a" },
            () => "",
            "row-1",
            CATEGORIES,
        );
        expect(ctx.locationId).toBe("child-site-b");
    });

    it("layout runtime inherits lead school when child school empty", () => {
        const ctx = resolveLayoutRuntimeEnrollmentPlacementContext(
            {},
            { location_id: "lead-site-a" },
            () => "",
            "row-1",
            CATEGORIES,
        );
        expect(ctx.locationId).toBe("lead-site-a");
    });

    it("child school does not overwrite lead when child has own site", () => {
        const childSite = "child-site-b";
        const leadSite = "lead-site-a";
        expect(childSite).not.toBe(leadSite);
        const ctx = resolveLayoutRuntimeEnrollmentPlacementContext(
            { "inquiry_child.location_id": childSite },
            { location_id: leadSite },
            () => "",
            "row-1",
            CATEGORIES,
        );
        expect(ctx.locationId).toBe(childSite);
    });
});

describe("placement foundation — cascade field resets", () => {
    it("changing program category clears room in form state", () => {
        const next = applyInquiryChildPlacementFieldChange(
            "desired_program_category_id",
            "cat-infant",
            {
                location_id: "site-north",
                desired_program_category_id: "cat-old",
                program_room_cohort_key: "room-infant-a",
            },
        );
        expect(next.program_room_cohort_key).toBe("");
        expect(inquiryChildPlacementRoleForFieldKey("desired_program_category_id")).toBe("program");
    });
});
