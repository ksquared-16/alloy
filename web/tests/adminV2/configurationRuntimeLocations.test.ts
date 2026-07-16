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
        expect(page).toContain("locations-overview-health");
        expect(page).toContain("locations-overview-capacity");
        expect(page).toContain("locations-overview-operations");
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
            expect(read(rel)).not.toMatch(
                /Location ID|Program key|Program ID|Room ID|Parent location ID|Pattern key|Pattern ID/,
            );
        }
    });

    it("uses summary-first programs and threshold staffing", () => {
        const programs = read("components/adminV2/settings/locations/LocationProgramDetailPanel.tsx");
        const rooms = read("components/adminV2/settings/locations/LocationRoomDetailPanel.tsx");
        expect(programs).toContain("locations-program-summary-");
        expect(programs).toContain("Rooms");
        expect(programs).toContain("Capacity");
        expect(programs).toContain("Age range");
        expect(programs).toContain("Edit program");
        expect(rooms).toContain("Threshold staffing");
        expect(rooms).toContain("Add staffing threshold");
        expect(rooms).toContain("formatStaffingThreshold");
    });

    it("keeps every location-owned concern in the Locations workspace", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        const panels = read("components/adminV2/settings/locations/LocationOwnedConcernPanels.tsx");
        expect(page).toContain("LocationToursPanel");
        expect(page).toContain("LocationPlacementPanel");
        expect(page).toContain("LocationCommunicationsPanel");
        expect(page).toContain("LocationAccessPanel");
        expect(page).not.toMatch(/href="\/settings\/(tours|placement-priority|communications|users-roles)/);
        expect(panels).toContain("Location-owned configuration");
        expect(panels).toContain("TourAvailabilitySettingsClient");
        expect(panels).not.toContain("PlacementPrioritySettingsClient");
        expect(panels).not.toContain("CommunicationsSetupClient");
        expect(panels).not.toContain("UsersRolesSettingsClient");
        expect(panels).toContain("/api/admin/settings/users-roles/members");
        expect(panels).toContain("/access-scope");
        expect(panels).toContain("department_scope: member.department_scope");
    });

    it("supports multiple schedule patterns and contextual actions", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        expect(page).toContain("+ Add Schedule Pattern");
        expect(page).toContain("LocationSchedulePatternCreatePanel");
        expect(page).toContain("Configure Capacity");
        expect(page).toContain("Resolve Time Zone");
        expect(page).toContain("Create Tour");
        expect(page).toContain("Publish Communications");
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
