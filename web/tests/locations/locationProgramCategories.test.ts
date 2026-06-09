import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveProgramsOfferedForSite } from "@/lib/admin/location/inquiryChildPlacementOptions";
import {
    findLocationProgramCategory,
    locationProgramCategoriesToSelectOptions,
    resolveActiveProgramCategoriesForSite,
    resolveLocationProgramCategoryLabel,
    resolveProgramCategoryIdForSiteKey,
    type LocationProgramCategoryRow,
} from "@/lib/locations/locationProgramCategories";
import { resolveInquiryChildProgramCategoryLabel } from "@/lib/admin/drawer/inquiryChildOcmPlacementDisplay";

const SITE_ID = "site-north";

const CATEGORIES: LocationProgramCategoryRow[] = [
    {
        id: "cat-infant",
        org_id: "org-1",
        location_id: SITE_ID,
        key: "infant",
        label: "Infant Care",
        sort_order: 10,
        is_active: true,
    },
    {
        id: "cat-toddler",
        org_id: "org-1",
        location_id: SITE_ID,
        key: "toddler",
        label: "Toddler",
        sort_order: 20,
        is_active: true,
    },
    {
        id: "cat-preschool-inactive",
        org_id: "org-1",
        location_id: SITE_ID,
        key: "preschool",
        label: "Preschool",
        sort_order: 30,
        is_active: false,
    },
];

describe("locationProgramCategories", () => {
    it("returns active categories per site sorted by sort_order", () => {
        const active = resolveActiveProgramCategoriesForSite(CATEGORIES, SITE_ID);
        expect(active.map((c) => c.key)).toEqual(["infant", "toddler"]);
    });

    it("maps categories to select options with stable keys", () => {
        const options = locationProgramCategoriesToSelectOptions(
            resolveActiveProgramCategoriesForSite(CATEGORIES, SITE_ID)
        );
        expect(options).toEqual([
            { value: "infant", label: "Infant Care", category_id: "cat-infant" },
            { value: "toddler", label: "Toddler", category_id: "cat-toddler" },
        ]);
    });

    it("prefers location categories over room-derived offerings in resolveProgramsOfferedForSite", () => {
        const options = resolveProgramsOfferedForSite(
            [
                {
                    id: "room-preschool-1",
                    label: "Preschool 1",
                    location_type: "unit",
                    parent_location_id: SITE_ID,
                    is_active: true,
                    metadata: { category: "preschool" },
                },
            ],
            SITE_ID,
            [{ item_key: "preschool", label: "Preschool (legacy)", sort_order: 1, is_active: true }],
            CATEGORIES
        );
        expect(options.map((o) => o.value)).toEqual(["infant", "toddler"]);
        expect(options[0]?.label).toBe("Infant Care");
    });

    it("excludes inactive categories from new selection lists", () => {
        const options = resolveProgramsOfferedForSite([], SITE_ID, [], CATEGORIES);
        expect(options.some((o) => o.value === "preschool")).toBe(false);
    });

    it("resolves label from category id when available", () => {
        expect(
            resolveLocationProgramCategoryLabel({
                categories: CATEGORIES,
                categoryId: "cat-infant",
            })
        ).toBe("Infant Care");
    });

    it("falls back to legacy option set label for desired_program_type-only rows", () => {
        const lookup = new Map([["childcare_program_type\0toddler", "Toddler Program"]]);
        expect(
            resolveInquiryChildProgramCategoryLabel({
                desired_program_type: "toddler",
                optionLabelLookup: lookup,
            })
        ).toBe("Toddler Program");
    });

    it("resolves category id from site + key", () => {
        expect(resolveProgramCategoryIdForSiteKey(CATEGORIES, SITE_ID, "infant")).toBe("cat-infant");
        expect(resolveProgramCategoryIdForSiteKey(CATEGORIES, SITE_ID, "preschool")).toBeNull();
    });

    it("findLocationProgramCategory includes inactive rows for display when requested", () => {
        expect(
            findLocationProgramCategory({
                categories: CATEGORIES,
                locationId: SITE_ID,
                key: "preschool",
                includeInactive: true,
            })?.label
        ).toBe("Preschool");
    });
});

describe("LocationsHierarchySettingsClient", () => {
    it("does not depend on hardcoded org program category registry", () => {
        const src = readFileSync(
            resolve(process.cwd(), "components/adminV2/settings/LocationsHierarchySettingsClient.tsx"),
            "utf8"
        );
        expect(src).not.toContain("listOrgProgramCategoriesForSettings");
        expect(src).not.toContain("orgProgramCategoryRegistry");
        expect(src).toContain("fetchLocationProgramCategories");
        expect(src).not.toContain("Org program categories");
    });
});
