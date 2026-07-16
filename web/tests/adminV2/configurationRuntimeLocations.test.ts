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
        expect(page).toContain("LocationsFleetLanding");
        expect(page).toContain("locations-object-selector");
        expect(page).toContain("locations-selected-location");
        expect(page).toContain("LocationsCommandRailActions");
        expect(page).toContain("LocationOverviewSurface");
        expect(page).toContain("buildLocationIdentityFacts");
        expect(page).toContain("xl:grid-cols-[14rem_minmax(0,1fr)]");
        expect(page).not.toContain("ConfigOperationalActions");
        expect(page).not.toContain("Address not set up yet");
        expect(page).not.toContain("locations-section-queue");
        expect(page).not.toContain("SettingsPageHeader");
        expect(page).not.toContain("data-locations-editor-table");
        expect(page).not.toContain("openDrawer");
        expect(page).not.toContain("useAdminDrawer");
        expect(page).toContain("LocationSiteCreatePanel");
    });

    it("opens the fleet landing when no locationId is in the URL", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        const fleet = read("components/adminV2/settings/locations/LocationsFleetLanding.tsx");
        const hook = read("components/adminV2/settings/locations/useLocationsConfigurationSettings.ts");
        const model = read("lib/locations/locationWorkspaceModel.ts");
        expect(page).toContain("buildLocationsFleetModel");
        expect(page).toContain("locationsFleetHref");
        expect(page).toContain("locations-back-to-fleet");
        expect(page).not.toContain("Choose a location, understand what needs attention");
        expect(fleet).toContain("locations-fleet-landing");
        expect(fleet).toContain("locations-fleet-rollups");
        expect(fleet).toContain("Operational readiness");
        expect(hook).toContain("Fleet landing: never auto-open");
        expect(hook).not.toContain("listItems[0]!.id");
        expect(model).toContain("buildLocationsFleetModel");
        expect(model).toContain("locationsFleetHref");
    });

    it("uses the seven ready owned-concern tabs and keeps General behind Edit Location", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        const model = read("lib/locations/locationWorkspaceModel.ts");
        for (const label of [
            "Overview",
            "Programs",
            "Rooms",
            "Schedule",
            "Tours",
            "Placement",
            "Access",
        ]) {
            expect(model).toContain(`label: "${label}"`);
        }
        expect(page).toContain("Edit Location");
        const tabCatalog = model.slice(model.indexOf("LOCATION_WORKSPACE_TABS"), model.indexOf("] as const;"));
        expect(tabCatalog).not.toContain('key: "general"');
        expect(tabCatalog).not.toContain("Communications");
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
        expect(programs).toContain("ConfigChildObjectMasterDetail");
        expect(programs).toContain("locations-program-age-unit");
        expect(programs).toContain("What is configured");
        expect(programs).toContain("Edit program");
        expect(rooms).toContain("Capacity & staffing");
        expect(rooms).toContain("Staffing thresholds");
        expect(rooms).toContain("Add staffing threshold");
        expect(rooms).toContain("formatStaffingThreshold");
        expect(rooms).toContain("ConfigChildObjectMasterDetail");
        expect(rooms).toContain("locations-room-consequence");
        expect(rooms).toContain("Adjust room");
        expect(rooms).not.toContain("Configure room");
        expect(rooms).not.toContain("Set how many children this room holds and the staffing ratio together.");
        expect(rooms.indexOf("Age range")).toBeLessThan(rooms.indexOf("locations-room-save"));
    });

    it("does not repeat active tab titles as tab-body headers", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        const panels = read("components/adminV2/settings/locations/LocationOwnedConcernPanels.tsx");
        expect(page).not.toContain("Operational summaries show what is offered");
        expect(page).not.toContain("Weekly patterns and location closures are managed as separate operational concerns");
        expect(panels).not.toContain("Location-owned configuration");
        expect(panels).not.toContain("<h2");
    });

    it("keeps every location-owned concern in the Locations workspace", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        const panels = read("components/adminV2/settings/locations/LocationOwnedConcernPanels.tsx");
        const rankingFactors = read("lib/orchestration/placement/waitlistRankingPolicyFactors.ts");
        const rankingEditor = read("components/adminV2/settings/PriorityRuleOrderEditor.tsx");
        expect(page).toContain("LocationToursPanel");
        expect(page).toContain("LocationPlacementPanel");
        expect(page).toContain("LocationAccessPanel");
        expect(page).not.toContain("LocationCommunicationsPanel");
        expect(page).not.toMatch(/href="\/settings\/(tours|placement-priority|communications|users-roles)/);
        expect(panels).toContain("TourAvailabilitySettingsClient");
        expect(panels).not.toContain("PlacementPrioritySettingsClient");
        expect(panels).not.toContain("CommunicationsSetupClient");
        expect(panels).not.toContain("UsersRolesSettingsClient");
        expect(panels).toContain("/api/admin/settings/users-roles/members");
        expect(panels).toContain("/access-scope");
        expect(panels).toContain("department_scope: member.department_scope");
        expect(panels).toContain("PriorityRuleOrderEditor");
        expect(panels).toContain("Sibling — this location");
        expect(panels).toContain("Employee");
        expect(panels).toContain("Application / waitlist date");
        expect(rankingFactors).toContain("Desired start date");
        expect(panels).toContain("Tie-break");
        expect(panels).toContain("Ordering mode");
        expect(panels).toContain("selectableCatalog");
        expect(panels).toContain("Saved on this Business Process, not this location");
        expect(panels).toContain("Applies at every location");
        expect(panels).toContain("Governing Business Process");
        expect(panels).toContain("Ranking active");
        expect(panels).not.toContain("Placement inventory");
        expect(rankingEditor).toContain("Available factors");
        expect(rankingEditor).toContain("onDragStart");
        expect(rankingEditor).toContain("onDrop");
        expect(rankingEditor).toContain("Move up");
        expect(rankingEditor).toContain("Move down");
    });

    it("supports multiple schedule patterns and shell-owned operational actions", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        expect(page).toContain("+ Add Schedule Pattern");
        expect(page).toContain("Closures / Holidays");
        expect(page).toContain("+ Add Closure");
        expect(page).toContain("LocationSchedulePatternCreatePanel");
        expect(page).toContain("LocationsCommandRailActions");
        expect(page).toContain("configure-capacity");
        expect(page).toContain("resolve-timezone");
        expect(page).toContain("apply-to");
        expect(read("components/adminV2/settings/locations/LocationsCommandRailActions.tsx")).toContain(
            'actionsPlacementSurface="company"',
        );
        expect(page).not.toContain("Publish Communications");
    });

    it("uses shared typography tokens", () => {
        const panel = read("components/adminV2/settings/locations/LocationSiteDetailPanel.tsx");
        const model = read("lib/locations/locationWorkspaceModel.ts");
        expect(panel).toContain("config-typo-field-label");
        expect(panel).toContain("config-typo-sublabel");
        expect(panel).toContain("config-runtime-input");
        expect(panel).toContain("<select");
        expect(panel).toContain("US_LOCATION_TIMEZONE_OPTIONS");
        expect(panel).toContain("normalizeUsLocationTimezone(timezone)");
        expect(panel).not.toContain('type="search"');
        expect(panel).not.toContain("supportedValuesOf");
        expect(panel).not.toContain("Select an IANA timezone");
        for (const [label, value] of [
            ["Eastern Time", "America/New_York"],
            ["Central Time", "America/Chicago"],
            ["Mountain Time", "America/Denver"],
            ["Arizona", "America/Phoenix"],
            ["Pacific Time", "America/Los_Angeles"],
            ["Alaska Time", "America/Anchorage"],
            ["Hawaii Time", "Pacific/Honolulu"],
        ]) {
            expect(model).toContain(`label: "${label}", value: "${value}"`);
        }
    });

    it("playwright locations spec exists", () => {
        expect(read("playwright/tests/configuration-runtime-locations.spec.ts")).toContain(
            "configuration-runtime-locations",
        );
    });
});
