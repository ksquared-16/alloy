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
import { resolveProgramCategoryOptionsForSite } from "@/lib/admin/location/inquiryChildPlacementOptions";
import { enrollmentPlacementOperatorLabel, ENROLLMENT_PROGRAM_MODEL } from "@/lib/fields/enrollmentPlacementDoctrine";
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

describe("enrollment placement E2 — program model", () => {
    it("canonical program storage is program_category_id with location cascade", () => {
        expect(ENROLLMENT_PROGRAM_MODEL.storage_field_key).toBe("program_category_id");
        expect(ENROLLMENT_PROGRAM_MODEL.operator_label).toBe("Program");
        expect(ENROLLMENT_PROGRAM_MODEL.option_source).toBe("programs_for_location");
        expect(ENROLLMENT_PROGRAM_MODEL.depends_on_field_key).toBe("location_id");
    });

    it("operator labels normalize Location and Program across registry surfaces", () => {
        expect(enrollmentPlacementOperatorLabel("location_id", "Site / location")).toBe("Location");
        expect(enrollmentPlacementOperatorLabel("program_category_id", "Desired program")).toBe("Program");
        expect(
            operatorFieldDisplayLabel("inquiry_child", {
                field_key: "program_category_id",
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
        expect(src).toContain("program_category_id");
    });
});

describe("enrollment placement E2 — program cascade", () => {
    it("program options derive from selected location (category FK values)", () => {
        const options = resolveProgramCategoryOptionsForSite("site-north", CATEGORIES);
        expect(options.map((o) => o.value)).toEqual(["cat-north-infant"]);
        expect(options[0]?.label).toBe("Infant");
    });

    it("program options refresh when location changes to another site", () => {
        const north = resolveProgramCategoryOptionsForSite("site-north", CATEGORIES);
        const south = resolveProgramCategoryOptionsForSite("site-south", CATEGORIES);
        expect(north[0]?.value).toBe("cat-north-infant");
        expect(south[0]?.value).toBe("cat-south-preschool");
    });

    it("clears invalid program when not offered at new location", () => {
        const southOptions = resolveProgramCategoryOptionsForSite("site-south", CATEGORIES);
        const cleared = clearProgramValueIfNotOffered("cat-north-infant", southOptions);
        expect(cleared).toBe("");
    });

    it("location change resets program and room fields", () => {
        const next = applyInquiryChildPlacementFieldChange("location_id", "site-south", {
            location_id: "site-north",
            program_category_id: "cat-north-infant",
            program_room_cohort_key: "room-1",
        });
        expect(next.location_id).toBe("site-south");
        expect(next.program_category_id).toBe("");
        expect(next.program_room_cohort_key).toBe("");
    });

    it("program selection derives the stable key from the category FK for room cascade", () => {
        expect(inquiryChildProgramUsesCategoryIdMode(CATEGORIES)).toBe(true);
        const selected = applyInquiryChildProgramSelection({
            value: "cat-south-preschool",
            categories: CATEGORIES,
        });
        expect(selected.program_category_id).toBe("cat-south-preschool");
        expect(selected.program_key).toBe("preschool");
        expect(
            resolveProgramKeyForRoomCascade({
                program_category_id: selected.program_category_id,
                categories: CATEGORIES,
            })
        ).toBe("preschool");
    });

    it("form values prefer program_category_id as program cascade key", () => {
        const keys = placementFieldKeysInValues({
            location_id: "site-north",
            program_category_id: "cat-north-infant",
        });
        expect(keys.programKey).toBe("program_category_id");
    });

    it("program select value is the stored category FK", () => {
        expect(
            resolveInquiryChildProgramSelectValue({
                program_category_id: "cat-north-infant",
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
        expect(src).toContain("inheritedLocationId");
    });

    it("Opportunity drawer child section uses category cascade and mismatch notice", () => {
        const src = readFileSync(
            resolve(__dirname, "../../components/admin/entity/OpportunityInquiryChildrenSection.tsx"),
            "utf8"
        );
        expect(src).toContain("inquiryChildPlacementOptions");
        expect(src).toContain("program_category_id");
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
