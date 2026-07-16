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
        expect(page).toContain("xl:grid-cols-[16rem_minmax(0,1fr)]");
        expect(page).toContain('data-testid="locations-hero"');
        expect(page).not.toContain("← All locations");
        expect(page).toContain('variant="rail"');
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
        expect(page).toContain("ConfigScopeContextBar");
        expect(page).toContain("returnToFleet");
        expect(page).not.toContain("← All locations");
        expect(page).not.toContain("Choose a location, understand what needs attention");
        expect(fleet).toContain("locations-fleet-landing");
        expect(fleet).toContain("locations-fleet-rollups");
        expect(fleet).toContain("Operational readiness");
        expect(hook).toContain("Fleet landing: never auto-open");
        expect(hook).not.toContain("listItems[0]!.id");
        expect(model).toContain("buildLocationsFleetModel");
        expect(model).toContain("locationsFleetHref");
    });

    it("uses the seven ready owned-concern tabs and keeps General behind Edit location (Actions)", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        const model = read("lib/locations/locationWorkspaceModel.ts");
        const rail = read("lib/locations/buildLocationsRailActions.ts");
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
        expect(rail).toContain('label: "Edit location"');
        expect(page).not.toContain('data-testid="locations-edit-location"');
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

    it("uses summary-first programs and threshold staffing with distinct view/edit modes", () => {
        const programs = read("components/adminV2/settings/locations/LocationProgramDetailPanel.tsx");
        const rooms = read("components/adminV2/settings/locations/LocationRoomDetailPanel.tsx");
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        expect(programs).toContain("locations-program-summary-");
        expect(programs).toContain("locations-program-edit-");
        expect(programs).toContain("ConfigChildObjectMasterDetail");
        expect(programs).toContain("locations-program-age-unit");
        expect(programs).toContain("locations-program-ops");
        expect(programs).toContain("Configured here");
        expect(programs).toContain("Edit program");
        expect(programs).toContain("ConfigEditorSection");
        expect(programs).toContain("Hours / operating rules");
        expect(programs).toContain("onAddProgram");
        expect(programs).not.toContain("Everything looks good");
        expect(rooms).toContain("Capacity / participation");
        expect(rooms).toContain("Staffing thresholds");
        expect(rooms).toContain("Add staffing threshold");
        expect(rooms).toContain("formatStaffingThreshold");
        expect(rooms).toContain("ConfigChildObjectMasterDetail");
        expect(rooms).toContain("locations-room-consequence");
        expect(rooms).toContain("locations-room-ops");
        expect(rooms).toContain("locations-room-edit");
        expect(rooms).toContain("Adjust room");
        expect(rooms).toContain("Hours / operating rules");
        expect(rooms).toContain("ConfigEditorSection");
        expect(rooms).not.toContain("Everything looks good");
        expect(rooms).not.toContain("Configure room");
        expect(page).toContain("createProgramCategory");
        expect(page).toContain("onAddProgram");
        expect(page).toContain("titleIcon");
        expect(page).toContain('organizationLabel="Organization"');
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
        const rail = read("lib/locations/buildLocationsRailActions.ts");
        expect(page).toContain("Closures / Holidays");
        expect(page).toContain("LocationSchedulePatternCreatePanel");
        expect(page).toContain("LocationsCommandRailActions");
        expect(page).toContain("buildLocationsRailActions");
        expect(page).not.toContain('data-testid="locations-add-location"');
        expect(page).not.toContain('data-testid="locations-edit-location"');
        expect(page).not.toContain("+ Add Schedule Pattern");
        expect(rail).toContain('id: "configure-capacity"');
        expect(rail).toContain('id: "resolve-timezone"');
        expect(rail).toContain('applyAction("apply-to"');
        expect(rail).toContain('group: "more"');
        expect(read("components/adminV2/settings/locations/LocationsCommandRailActions.tsx")).toContain(
            'actionsPlacementSurface="company"',
        );
        expect(read("components/adminV2/settings/locations/LocationsCommandRailActions.tsx")).toContain(
            "More actions",
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
