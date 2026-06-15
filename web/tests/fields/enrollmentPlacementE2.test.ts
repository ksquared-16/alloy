import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    applyInquiryChildPlacementFieldChange,
    placementFieldKeysInValues,
} from "@/lib/admin/location/inquiryChildPlacementFieldKeys";
import {
    applyInquiryChildProgramSelection,
    clearProgramValueIfNotOffered,
    inquiryChildProgramUsesCategoryIdMode,
    resolveInquiryChildLocationMismatch,
    resolveInquiryChildProgramSelectValue,
    resolveProgramKeyForRoomCascade,
} from "@/lib/admin/location/inquiryChildLocationMismatch";
import {
    resolveProgramSelectOptionsForSite,
    type InquiryChildPlacementHierarchyRow,
    type InquiryChildProgramOptionSetItem,
} from "@/lib/admin/location/inquiryChildPlacementOptions";
import { enrollmentPlacementOperatorLabel, ENROLLMENT_PROGRAM_MODEL } from "@/lib/fields/enrollmentPlacementDoctrine";
import { isChildcareLegacyOrSystemField } from "@/lib/fields/childcareFieldCatalogDoctrine";
import { operatorFieldDisplayLabel } from "@/lib/fields/fieldSettingsOperatorUi";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";

const CATEGORIES: LocationProgramCategoryRow[] = [
    {
        id: "cat-north-infant",
        org_id: "org-1",
        location_id: "site-north",
        key: "infant",
        label: "Infant",
        sort_order: 1,
        is_active: true,
    },
    {
        id: "cat-south-preschool",
        org_id: "org-1",
        location_id: "site-south",
        key: "preschool",
        label: "Preschool",
        sort_order: 1,
        is_active: true,
    },
];

const PROGRAM_ITEMS: InquiryChildProgramOptionSetItem[] = [
    { item_key: "infant", label: "Infant", sort_order: 1, is_active: true },
    { item_key: "preschool", label: "Preschool", sort_order: 2, is_active: true },
];

function hierarchy(): InquiryChildPlacementHierarchyRow[] {
    return [
        { id: "site-north", label: "North Campus", location_type: "site", parent_location_id: null, is_active: true },
        { id: "site-south", label: "South Campus", location_type: "site", parent_location_id: null, is_active: true },
    ];
}

describe("enrollment placement E2 — program model", () => {
    it("canonical program storage is desired_program_category_id with location cascade", () => {
        expect(ENROLLMENT_PROGRAM_MODEL.storage_field_key).toBe("desired_program_category_id");
        expect(ENROLLMENT_PROGRAM_MODEL.operator_label).toBe("Program");
        expect(ENROLLMENT_PROGRAM_MODEL.option_source).toBe("programs_for_location");
        expect(ENROLLMENT_PROGRAM_MODEL.depends_on_field_key).toBe("location_id");
    });

    it("operator labels normalize Location and Program across registry surfaces", () => {
        expect(enrollmentPlacementOperatorLabel("location_id", "Site / location")).toBe("Location");
        expect(enrollmentPlacementOperatorLabel("desired_program_category_id", "Desired program")).toBe("Program");
        expect(
            operatorFieldDisplayLabel("inquiry_child", {
                field_key: "desired_program_category_id",
                label: "x",
                is_system: true,
            })
        ).toBe("Program");
        expect(
            operatorFieldDisplayLabel("inquiry_child", {
                field_key: "location_id",
                label: "x",
                is_system: false,
            })
        ).toBe("Location");
    });

    it("desired_program_type is legacy/system and hidden from default operator pickers", () => {
        expect(isChildcareLegacyOrSystemField("inquiry_child", "desired_program_type")).toBe(true);
    });
});

describe("enrollment placement E2 — location inheritance and mismatch", () => {
    it("no mismatch when child location matches lead location", () => {
        const state = resolveInquiryChildLocationMismatch({
            leadLocationId: "site-north",
            childLocationId: "site-north",
        });
        expect(state.mismatched).toBe(false);
        expect(state.notice).toBeNull();
    });

    it("shows soft notice when child location differs from lead (multi-location family)", () => {
        const state = resolveInquiryChildLocationMismatch({
            leadLocationId: "site-north",
            childLocationId: "site-south",
        });
        expect(state.mismatched).toBe(true);
        expect(state.notice).toContain("different location");
    });

    it("Add Child modal seeds inherited location_id from defaultLocationId", () => {
        const src = readFileSync(
            resolve(__dirname, "../../components/admin/opportunity/actions/AddInquiryChildModal.tsx"),
            "utf8"
        );
        expect(src).toContain('field.field_key === "location_id" && inheritedLocation');
        expect(src).toContain("defaultLocationId");
        expect(src).toContain("inheritedLocationId={defaultLocationId}");
    });

    it("submit inherits opportunity location when child omits location_id", () => {
        const src = readFileSync(
            resolve(__dirname, "../../lib/admin/actions/submitAddInquiryChildFromDrawer.ts"),
            "utf8"
        );
        expect(src).toContain("opportunityLocationId");
        expect(src).toContain("desired_program_category_id");
    });
});

describe("enrollment placement E2 — program cascade", () => {
    it("program options derive from selected location (category id mode)", () => {
        const options = resolveProgramSelectOptionsForSite(
            hierarchy(),
            "site-north",
            PROGRAM_ITEMS,
            CATEGORIES,
            "category_id"
        );
        expect(options.map((o) => o.value)).toEqual(["cat-north-infant"]);
        expect(options[0]?.label).toBe("Infant");
    });

    it("program options refresh when location changes to another site", () => {
        const north = resolveProgramSelectOptionsForSite(
            hierarchy(),
            "site-north",
            PROGRAM_ITEMS,
            CATEGORIES,
            "category_id"
        );
        const south = resolveProgramSelectOptionsForSite(
            hierarchy(),
            "site-south",
            PROGRAM_ITEMS,
            CATEGORIES,
            "category_id"
        );
        expect(north[0]?.value).toBe("cat-north-infant");
        expect(south[0]?.value).toBe("cat-south-preschool");
    });

    it("clears invalid program when not offered at new location", () => {
        const southOptions = resolveProgramSelectOptionsForSite(
            hierarchy(),
            "site-south",
            PROGRAM_ITEMS,
            CATEGORIES,
            "category_id"
        );
        const cleared = clearProgramValueIfNotOffered("cat-north-infant", southOptions);
        expect(cleared).toBe("");
    });

    it("location change resets program and room fields", () => {
        const next = applyInquiryChildPlacementFieldChange("location_id", "site-south", {
            location_id: "site-north",
            desired_program_category_id: "cat-north-infant",
            desired_program_type: "infant",
            program_room_cohort_key: "room-1",
        });
        expect(next.location_id).toBe("site-south");
        expect(next.desired_program_category_id).toBe("");
        expect(next.desired_program_type).toBe("");
        expect(next.program_room_cohort_key).toBe("");
    });

    it("program selection maps category id to legacy key for room cascade", () => {
        expect(inquiryChildProgramUsesCategoryIdMode(CATEGORIES)).toBe(true);
        const selected = applyInquiryChildProgramSelection({
            value: "cat-south-preschool",
            useCategoryMode: true,
            categories: CATEGORIES,
        });
        expect(selected.desired_program_category_id).toBe("cat-south-preschool");
        expect(selected.desired_program_type).toBe("preschool");
        expect(
            resolveProgramKeyForRoomCascade({
                desired_program_category_id: selected.desired_program_category_id,
                desired_program_type: selected.desired_program_type,
                categories: CATEGORIES,
            })
        ).toBe("preschool");
    });

    it("form values prefer desired_program_category_id as program cascade key", () => {
        const keys = placementFieldKeysInValues({
            location_id: "site-north",
            desired_program_category_id: "cat-north-infant",
        });
        expect(keys.programKey).toBe("desired_program_category_id");
    });

    it("program select value uses category id when category mode is active", () => {
        expect(
            resolveInquiryChildProgramSelectValue({
                useCategoryMode: true,
                desired_program_category_id: "cat-north-infant",
                desired_program_type: "",
            })
        ).toBe("cat-north-infant");
    });
});

describe("enrollment placement E2 — cross-surface wiring", () => {
    it("ConfiguredCreateFormFields wires cascade, helpers, and mismatch notice", () => {
        const src = readFileSync(
            resolve(__dirname, "../../components/admin/opportunity/actions/ConfiguredCreateFormFields.tsx"),
            "utf8"
        );
        expect(src).toContain("useInquiryChildPlacementCascade");
        expect(src).toContain("ENROLLMENT_PLACEMENT_PROGRAM_DISABLED_HELPER");
        expect(src).toContain("data-inquiry-child-location-mismatch");
        expect(src).toContain("inheritedLocationId");
    });

    it("Opportunity drawer child section uses category cascade and mismatch notice", () => {
        const src = readFileSync(
            resolve(__dirname, "../../components/admin/entity/OpportunityInquiryChildrenSection.tsx"),
            "utf8"
        );
        expect(src).toContain("resolveProgramSelectOptionsForSite");
        expect(src).toContain("applyInquiryChildProgramSelection");
        expect(src).toContain("opportunityLocationId");
        expect(src).toContain("data-inquiry-child-location-mismatch");
    });

    it("placement metadata depends on location_id for program field", () => {
        const src = readFileSync(
            resolve(__dirname, "../../lib/fields/inquiryChildPlacementFieldMetadata.ts"),
            "utf8"
        );
        expect(src).toContain('depends_on_field_key: "location_id"');
        expect(src).toContain("programs_for_location");
    });
});
