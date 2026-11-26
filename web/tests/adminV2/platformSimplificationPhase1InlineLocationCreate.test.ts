/**
 * Platform Simplification Sprint — Phase 1: Settings Add Location must not use legacy drawer.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("platform simplification phase 1 — inline location create", () => {
    it("LocationsConfigurationPage does not open the legacy drawer for Add Location", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        expect(page).not.toContain("useAdminDrawer");
        expect(page).not.toContain("openDrawer");
        expect(page).toContain("LocationSiteCreatePanel");
        expect(page).toContain("createSiteLocation");
        expect(page).toContain('data-testid="locations-add-location"');
    });

    it("create hook posts site locations to the canonical API", () => {
        const hook = read("components/adminV2/settings/locations/useLocationsConfigurationSettings.ts");
        expect(hook).toContain('method: "POST"');
        expect(hook).toContain('"/api/admin/locations"');
        expect(hook).toContain('location_type: "site"');
        expect(hook).toContain("createSiteLocation");
    });

    it("inline create panel uses Configuration Mode workspace (no drawer chrome)", () => {
        const panel = read("components/adminV2/settings/locations/LocationSiteCreatePanel.tsx");
        expect(panel).toContain("ConfigurationDetailCard");
        expect(panel).toContain('testId="locations-site-create"');
        expect(panel).not.toMatch(/openDrawer|AdminEntityDrawer|useAdminDrawer/);
    });
});
