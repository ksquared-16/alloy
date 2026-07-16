/** Locations is the object-centric reference configuration workspace. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Configuration Runtime — Locations", () => {
    it("settings route mounts LocationsConfigurationPage", () => {
        expect(read("app/adminV2/settings/locations/page.tsx")).toContain("LocationsConfigurationPage");
        expect(read("app/adminV2/settings/locations/page.tsx")).not.toContain("LocationsHierarchySettingsClient");
    });

    it("LocationsConfigurationPage uses the shared shell as a location-first workspace", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        expect(page).toContain("ConfigurationContext");
        expect(page).toContain("ConfigurationShell");
        expect(page).toContain('title="Locations"');
        expect(page).toContain("locations-object-selector");
        expect(page).toContain("locations-selected-location");
        expect(page).toContain("locations-setup-progress");
        expect(page).not.toContain("locations-section-queue");
        expect(page).not.toContain("SettingsPageHeader");
        expect(page).not.toContain("data-locations-editor-table");
        expect(page).not.toContain("openDrawer");
        expect(page).not.toContain("useAdminDrawer");
        expect(page).toContain("LocationSiteCreatePanel");
    });

    it("uses the eight owned-concern tabs and keeps General behind Edit Location", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        const model = read("lib/locations/locationWorkspaceModel.ts");
        for (const label of [
            "Overview",
            "Programs",
            "Rooms",
            "Schedule",
            "Tours",
            "Placement",
            "Communications",
            "Access",
        ]) {
            expect(model).toContain(`label: "${label}"`);
        }
        expect(page).toContain("Edit Location");
        const tabCatalog = model.slice(model.indexOf("LOCATION_WORKSPACE_TABS"), model.indexOf("] as const;"));
        expect(tabCatalog).not.toContain('key: "general"');
    });

    it("keeps implementation identifiers out of the operator panels", () => {
        for (const rel of [
            "components/adminV2/settings/locations/LocationSiteDetailPanel.tsx",
            "components/adminV2/settings/locations/LocationProgramDetailPanel.tsx",
            "components/adminV2/settings/locations/LocationRoomDetailPanel.tsx",
            "components/adminV2/settings/locations/LocationScheduleTemplateDetailPanel.tsx",
        ]) {
            expect(read(rel)).not.toMatch(/Location ID|Program key|Program ID|Room ID|Parent location ID|Pattern key|Pattern ID/);
        }
    });

    it("uses shared typography tokens", () => {
        const panel = read("components/adminV2/settings/locations/LocationSiteDetailPanel.tsx");
        expect(panel).toContain("config-typo-field-label");
        expect(panel).toContain("config-typo-sublabel");
        expect(panel).toContain("config-runtime-input");
    });

    it("playwright locations spec exists", () => {
        expect(read("playwright/tests/configuration-runtime-locations.spec.ts")).toContain(
            "configuration-runtime-locations",
        );
    });
});
