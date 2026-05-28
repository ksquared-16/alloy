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

    it("supports controlled demo archive via PATCH is_active", () => {
        const src = read("components/adminV2/settings/LocationsHierarchySettingsClient.tsx");
        expect(src).toContain('method: "PATCH"');
        expect(src).toContain("is_active: false");
        expect(src).toContain("isDemoLocation");
    });
});
