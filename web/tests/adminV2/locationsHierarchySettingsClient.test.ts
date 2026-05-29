import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("LocationsHierarchySettingsClient pilot UX", () => {
    it("does not link to legacy full location list", () => {
        const src = read("components/adminV2/settings/LocationsHierarchySettingsClient.tsx");
        expect(src).not.toContain('href="/admin/locations"');
        expect(src).not.toContain("Full location list");
    });

    it("includes search and org category section", () => {
        const src = read("components/adminV2/settings/LocationsHierarchySettingsClient.tsx");
        expect(src).toContain('id="locations-search"');
        expect(src).toContain("listOrgProgramCategoriesForSettings");
        expect(src).toContain("Org program categories");
    });

    it("renders canonical locations table editor with inline metadata patch", () => {
        const src = read("components/adminV2/settings/LocationsHierarchySettingsClient.tsx");
        expect(src).toContain('data-locations-editor-table="true"');
        expect(src).toContain('method: "PATCH"');
        expect(src).toContain("patchMetadataField");
        expect(src).toContain("student_teacher_ratio");
        expect(src).not.toContain('href="/admin/locations"');
        expect(src).toContain("/api/admin/deletion-eligibility");
    });

    it("does not reference parallel location metadata registry", () => {
        const src = read("components/adminV2/settings/LocationsHierarchySettingsClient.tsx");
        expect(src).not.toContain("locationRoomMetadataFieldRegistry");
    });

    it("LocationsHierarchySettingsClient loads option sets for category and age unit selects", () => {
        const src = read("components/adminV2/settings/LocationsHierarchySettingsClient.tsx");
        expect(src).toContain("fetchOptionSetItemsBySetKey");
        expect(src).toContain("categorySelectOptions");
        expect(src).toContain("ageUnitSelectOptions");
        expect(src).toContain("mapOptionItemsToSelectOptions");
    });

    it("uses compact column widths for category, age range, capacity, and ratio", () => {
        const presentation = read("lib/adminV2/locationsHierarchyTablePresentation.ts");
        expect(presentation).toContain("LOCATIONS_EDITOR_TABLE_COLUMN_CLASS");
        expect(presentation).toContain("max-w-[160px]");
        expect(presentation).toContain("LOCATIONS_EDITOR_AGE_RANGE_INPUT_CLASS");
        expect(presentation).toContain("w-[70px]");
        expect(presentation).toContain("LOCATIONS_EDITOR_AGE_RANGE_UNIT_CLASS");
        expect(presentation).toContain("w-[95px]");

        const src = read("components/adminV2/settings/LocationsHierarchySettingsClient.tsx");
        expect(src).toContain("LOCATIONS_EDITOR_TABLE_COLUMN_CLASS");
        expect(src).toContain("LOCATIONS_EDITOR_AGE_RANGE_INPUT_CLASS");
        expect(src).toContain("table-fixed");
        expect(src).not.toContain("min-w-[9rem]");
    });
});
