/**
 * Configuration Runtime — Locations page uses Context → Queue → Workspace → BOS.
 */
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

    it("LocationsConfigurationPage uses Configuration Mode shell", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        expect(page).toContain("ConfigurationContext");
        expect(page).toContain("ConfigurationShell");
        expect(page).toContain('title="Locations"');
        expect(page).toContain("Configure campuses, programs, classrooms, and scheduling resources.");
        expect(page).toContain("locations-section-queue");
        expect(page).toContain("locations-item-queue");
        expect(page).not.toContain("SettingsPageHeader");
        expect(page).not.toContain("data-locations-editor-table");
        expect(page).not.toContain("openDrawer");
        expect(page).not.toContain("useAdminDrawer");
        expect(page).toContain("LocationSiteCreatePanel");
    });

    it("section queue includes Locations, Programs, Rooms, and Schedule Templates", () => {
        const hook = read("components/adminV2/settings/locations/useLocationsConfigurationSettings.ts");
        expect(hook).toContain('"locations"');
        expect(hook).toContain('"programs"');
        expect(hook).toContain('"rooms"');
        expect(hook).toContain('"schedule_templates"');
        expect(hook).toContain("Schedule Templates");
    });

    it("workspace detail panels hide technical metadata under Advanced", () => {
        expect(read("components/adminV2/settings/locations/LocationSiteDetailPanel.tsx")).toContain(
            "ConfigurationAdvancedSection",
        );
        expect(read("components/adminV2/settings/locations/LocationProgramDetailPanel.tsx")).toContain("Program key");
        expect(read("components/adminV2/settings/locations/LocationRoomDetailPanel.tsx")).toContain("Room ID");
        expect(read("components/adminV2/settings/locations/LocationScheduleTemplateDetailPanel.tsx")).toContain(
            "Pattern key",
        );
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
