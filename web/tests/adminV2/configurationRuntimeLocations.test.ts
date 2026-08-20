/** Locations is the object-centric reference configuration workspace. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { locationsCollectionUsesBoundedScroll } from "@/components/adminV2/settings/locations/LocationsLanding";

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
        expect(page).toContain("LocationsLanding");
        expect(page).toContain("LocationsObjectSelector");
        expect(read("components/adminV2/settings/locations/LocationsObjectSelector.tsx")).toContain(
            'data-testid="locations-object-selector"',
        );
        expect(page).toContain("locations-selected-location");
        expect(page).toContain("LocationsCommandRailActions");
        expect(page).toContain("LocationOverviewSurface");
        expect(page).toContain("ConfigDetailRuntime");
        expect(page).toContain("operatingSnapshot");
        expect(page).toContain("LocationIdentityFactsRow");
        expect(page).toContain("xl:grid-cols-[20.5rem_minmax(0,1fr)]");
        expect(page).toContain('headerTestId="locations-hero"');
        expect(page).toContain("titleIcon");
        expect(page).not.toContain("← All locations");
        expect(page).not.toContain("% ready");
        const selector = read("components/adminV2/settings/locations/LocationsObjectSelector.tsx");
        expect(selector).toContain('data-testid="locations-nav-add-location"');
        expect(selector).toContain("locations-collection-rail");
        expect(selector).toContain("locations-collection-row");
        expect(selector).toContain('data-testid="locations-nav-filter-inactive"');
        expect(selector).toContain("formatLocationShortPlaceLine");
        expect(selector).not.toContain("ConfigurationQueueItem");
        expect(read("lib/locations/locationSelectorSignal.ts")).toContain("needs attention");
        expect(read("lib/locations/locationSelectorSignal.ts")).not.toContain("setupPercent");
        expect(selector).toContain("QUEUE_ROW_CARD_SELECTED_BORDER_CLASS");
        expect(selector).toContain("QUEUE_ROW_SELECTED_RAIL_CLASS");
        const overview = read("components/adminV2/settings/locations/LocationOverviewSurface.tsx");
        expect(overview).toContain("locations-overview-facts");
        expect(overview).toContain("Programs Offered");
        expect(overview).toContain("Operating Hours");
        expect(overview).not.toContain("locations-overview-at-a-glance");
        expect(overview).not.toContain("locations-overview-capacity-bar");
        expect(overview).not.toContain("ConfigOperationalReadiness");
        expect(overview).not.toContain("%");
        expect(overview).not.toContain("operating picture");
        expect(selector).not.toContain("bg-alloy-bend-pine/[0.14]");
        expect(selector).not.toContain("bg-alloy-midnight/[0.04]");
        expect(read("components/adminV2/settings/configurationRuntime/workspace/ConfigAttentionPanel.tsx")).toContain(
            "consequence",
        );
        expect(read("lib/locations/buildLocationsRailActions.ts")).not.toContain("Coming soon");
        expect(read("lib/locations/buildLocationsRailActions.ts")).not.toContain("Not available yet");
        expect(page).toContain('variant="rail"');
        expect(page).not.toContain("ConfigOperationalActions");
        expect(page).not.toContain("locations-section-queue");
        expect(page).not.toContain("SettingsPageHeader");
        expect(page).not.toContain("data-locations-editor-table");
        expect(page).not.toContain("openDrawer");
        expect(page).not.toContain("useAdminDrawer");
        expect(page).toContain("LocationSiteCreatePanel");
    });

    it("opens the Locations collection when no locationId is in the URL", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        const landing = read("components/adminV2/settings/locations/LocationsLanding.tsx");
        const hook = read("components/adminV2/settings/locations/useLocationsConfigurationSettings.ts");
        const model = read("lib/locations/locationWorkspaceModel.ts");
        const selector = read("components/adminV2/settings/locations/LocationsObjectSelector.tsx");
        expect(page).toContain("buildLocationsCollectionModel");
        expect(page).toContain("locationsLandingHref");
        expect(page).toContain("ConfigScopeContextBar");
        expect(page).toContain("returnToLocations");
        expect(page).not.toContain("← All locations");
        expect(page).not.toContain("Choose a location, understand what needs attention");
        expect(landing).toContain("locations-landing");
        expect(page).toContain("locations-collection-posture");
        expect(page).toContain("xl:grid-cols-[20.5rem_minmax(0,1fr)]");
        expect(landing).toContain("locations-landing-summary");
        expect(landing).toContain("Active Locations");
        expect(landing).toContain("Programs Offered");
        expect(landing).toContain("Total Capacity");
        expect(landing).toContain("Locations at a glance");
        expect(landing).toContain("locations-list-card");
        expect(landing).toContain("locations-row-");
        expect(landing).toContain("divide-y divide-alloy-forge/10");
        expect(landing).not.toContain("% ready");
        expect(landing).not.toContain("setupPercent");
        expect(landing).not.toContain("Needs attention");
        expect(landing).not.toContain("attentionHighlights");
        expect(landing).not.toContain("ConfigOperationalReadiness");
        expect(hook).toContain("Locations landing: never auto-open");
        expect(hook).toContain("allowRetainedRestore: false");
        expect(hook).not.toContain("listItems[0]!.id");
        expect(model).toContain("buildLocationsCollectionModel");
        expect(model).toContain("locationsLandingHref");
        expect([page, landing, hook, model, selector].join("\n")).not.toContain("right-hand summary rail");
    });

    it("bounds only collections with at least seven visible locations", () => {
        const eightLocationFixture = Array.from({ length: 8 }, (_, index) => ({ id: `location-${index + 1}` }));
        expect(locationsCollectionUsesBoundedScroll(6)).toBe(false);
        expect(locationsCollectionUsesBoundedScroll(eightLocationFixture.length)).toBe(true);
    });

    it("freezes the Configuration Catalog and Collection Runtime templates", () => {
        const doctrine = read("../docs/platform/operator/configuration-workspace-platform-doctrine.md");
        expect(doctrine).toContain("Configuration Collection");
        expect(doctrine).toContain("Configuration Object");
        expect(doctrine).toContain("Configuration Detail Runtime");
        expect(doctrine).toContain("Template A — Configuration Catalog");
        expect(doctrine).toContain("Template B — Configuration Collection");
        expect(doctrine).toContain("Cross-object triage");
        expect(doctrine).toContain("Show the first five");
        expect(doctrine).toContain("| Data Model | Collection Runtime |");
        expect(doctrine).toContain("| Operational Calculations | Collection Runtime |");
    });

    it("uses the seven ready owned-concern tabs and owns Edit location on the object header", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        const model = read("lib/locations/locationWorkspaceModel.ts");
        const rail = read("lib/locations/buildLocationsRailActions.ts");
        for (const label of [
            "Overview",
            "Programs",
            "Rooms",
            "Scheduling",
            "Tours",
            "Placement",
            "Access",
        ]) {
            expect(model).toContain(`label: "${label}"`);
        }
        expect(page).toContain('data-testid="locations-edit-location"');
        expect(page).toContain('data-testid="locations-breadcrumb-collection"');
        expect(page).toContain("LocationIdentityFactsRow");
        expect(rail).not.toContain('label: "Edit location"');
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

    it("uses offerings checklist for Location Programs and simplified Rooms", () => {
        const offerings = read("components/adminV2/settings/locations/LocationProgramsOfferedPanel.tsx");
        const rooms = read("components/adminV2/settings/locations/LocationRoomDetailPanel.tsx");
        const roomMeta = read("lib/locations/roomOfferingMetadata.ts");
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        expect(offerings).toContain("effectiveLocationProgramLabel");
        expect(offerings).toContain("buildLocationProgramAvailabilityView");
        expect(offerings).toContain("ConfigChildObjectMasterDetail");
        expect(offerings).toContain("local_display_name");
        expect(offerings).toContain("available_from");
        expect(offerings).toContain("available_through");
        expect(offerings).toContain("is_active: false");
        expect(offerings).not.toContain(">Configure<");
        expect(offerings).not.toContain("locations-program-configure");
        expect(offerings).not.toContain("remove_locations");
        expect(page).toContain("LocationProgramsOfferedPanel");
        expect(page).toContain("LocationAddProgramPanel");
        expect(page).toContain("setCreatingProgram(true)");
        expect(page).not.toContain('router.push("/organization/programs")');
        expect(page).not.toContain("LocationProgramCreatePanel");
        expect(read("app/api/admin/location-program-categories/route.ts")).toContain("metadata");
        expect(rooms).toContain("Programs supported");
        expect(rooms).toContain("writeRoomProgramsAndScheduleMetadata");
        expect(rooms).toContain("locations-room-schedule-pattern");
        expect(rooms).toContain("ConfigChildObjectMasterDetail");
        expect(rooms).toContain("locations-room-ops");
        expect(rooms).toContain("locations-room-edit");
        expect(rooms).toContain("Edit room");
        expect(rooms).toContain("ConfigEditorSection");
        expect(rooms).not.toContain("Staffing thresholds");
        expect(rooms).not.toContain("Add staffing threshold");
        expect(rooms).not.toContain("Age range");
        expect(rooms).not.toContain("Everything looks good");
        expect(roomMeta).toContain("supported_program_keys");
        expect(roomMeta).toContain("schedule_pattern_id");
        expect(page).toContain("onAddProgram");
        expect(page).toContain("titleIcon");
        expect(page).toContain('organizationLabel="Organization"');
    });

    it("reuses canonical queue-row and Bend Pine button primitives", () => {
        const selector = read("components/adminV2/settings/locations/LocationsObjectSelector.tsx");
        const mode = read("components/adminV2/settings/configurationRuntime/ConfigurationModeLayout.tsx");
        const queueShell = read("lib/presentation/runtime/queueRowCardShell.ts");
        const programs = read("components/adminV2/settings/locations/LocationProgramDetailPanel.tsx");

        for (const source of [selector, mode]) {
            expect(source).toContain("QUEUE_ROW_CARD_SELECTED_BORDER_CLASS");
            expect(source).toContain("QUEUE_ROW_SELECTED_RAIL_CLASS");
        }
        expect(queueShell).toContain("!bg-alloy-bend-pine/[0.06]");
        expect(queueShell).toContain("bg-alloy-bend-pine");
        expect(mode).toContain("ConfigurationSecondaryButton");
        expect(mode).not.toContain("config-primary-btn");
        expect(programs).toContain("ConfigurationSecondaryButton");
        expect(programs).not.toContain("#00a283");
        expect(programs).not.toContain("#007d68");
        expect(selector).toContain("ConfigurationPrimaryButton");
        expect(selector).toContain("text-alloy-bend-pine");
        expect(selector).toContain("text-alloy-midnight/30");
    });

    it("opens Schedule creation without immediately clearing create mode", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        const start = page.indexOf("onCreateSchedule:");
        const handler = page.slice(start, start + 180);
        expect(handler).toContain("setCreatingSchedule(true)");
        expect(handler).not.toContain('navigate("schedule")');
    });

    it("requires authoritative mutation responses and preserves Room ownership on create", () => {
        const settings = read("components/adminV2/settings/locations/useLocationsConfigurationSettings.ts");
        const locationsRoute = read("app/api/admin/locations/route.ts");
        const roomCreate = read("components/adminV2/settings/locations/LocationRoomCreatePanel.tsx");
        const ownedConcerns = read("components/adminV2/settings/locations/LocationOwnedConcernPanels.tsx");
        const tours = read("app/adminV2/settings/tours/availability/TourAvailabilitySettingsClient.tsx");

        expect(settings).toContain("mutationResponseContainsPatch");
        expect(settings).toContain("Program save was not confirmed by the authoritative response.");
        expect(settings).toContain("Room creation was not confirmed by the authoritative response.");
        expect(locationsRoute).toContain("parent_location_id is required for room units");
        expect(locationsRoute).toContain("Parent location must be a site in this organization");
        expect(locationsRoute).toContain("parent_location_id,");
        expect(roomCreate).toContain("locations-room-create-save");
        expect(roomCreate).toContain("writeRoomProgramsAndScheduleMetadata");
        expect(roomCreate).toContain("locations-room-create-schedule-pattern");
        expect(roomCreate).not.toContain("student_teacher_ratio");
        expect(ownedConcerns).toContain("Waitlist ranking save was not confirmed");
        expect(ownedConcerns).toContain("Location access save was not confirmed");
        expect(ownedConcerns).not.toContain("#00a283");
        expect(ownedConcerns).not.toContain("#007d68");
        expect(tours).toContain("Tour availability creation was not confirmed");
        expect(tours).toContain("Tour availability save");
        expect(tours).toContain("locations-tour-edit-form");
        expect(tours).toContain("Save tour window");
        expect(tours).toContain("onMutationCommitted");
        expect(read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx")).toContain(
            "refreshOwnedConcernSetup",
        );
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
        expect(panels).toContain("loadLocationAccessMembers");
        expect(read("lib/locations/locationConcernCache.ts")).toContain(
            "/api/admin/settings/users-roles/members",
        );
        expect(panels).toContain("/access-scope");
        // The invariant is that granting a location does not silently decide the DEPARTMENT
        // dimension — the PATCH carries the member's existing one. W-47 made `unset` (no access
        // profile row) representable, which `member.department_scope` can now hold and the
        // access-scope PATCH does not accept, so W-49 routes it through `enforcedDepartmentScope`.
        // For any member with a profile that helper returns `member.department_scope` unchanged;
        // for an `unset` one it returns what the platform enforces today instead of an invalid
        // value. Same invariant, expressed against a wider union.
        expect(panels).toContain("department_scope: enforcedDepartmentScope(member)");
        expect(panels).toContain("PriorityRuleOrderEditor");
        expect(panels).toContain("Sibling — this location");
        expect(panels).toContain("Employee");
        expect(panels).toContain("Application / waitlist date");
        expect(rankingFactors).toContain("Desired start date");
        expect(panels).toContain("Tie-break");
        expect(panels).toContain("Ordering mode");
        expect(panels).toContain("selectableCatalog");
        expect(panels).toContain("Saved on {selectedProcessName}");
        expect(panels).toContain("Applies at every location");
        expect(panels).toContain("Governing Business Process");
        expect(panels).toContain("locations-placement-process");
        expect(panels).toContain("locations-placement-stage");
        expect(panels).toContain("lifecycle_process_id");
        expect(panels).toContain("lifecycle_stage_label");
        expect(panels).toContain("Ranking active");
        expect(panels).not.toContain("Placement inventory");
        expect(rankingEditor).toContain("Available factors");
        expect(rankingEditor).toContain("onDragStart");
        expect(rankingEditor).toContain("onDrop");
        expect(rankingEditor).toContain("Move up");
        expect(rankingEditor).toContain("Move down");
    });

    it("supports Schedule Definitions with independent Day Type and Repeats", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        const rail = read("lib/locations/buildLocationsRailActions.ts");
        const create = read("components/adminV2/settings/locations/LocationSchedulePatternCreatePanel.tsx");
        const detail = read("components/adminV2/settings/locations/LocationScheduleTemplateDetailPanel.tsx");
        const presentation = read("lib/locations/schedulePatternPresentation.ts");
        const service = read("lib/childcareOperational/schedulePatternService.ts");
        const route = read("app/api/admin/schedule-patterns/route.ts");
        expect(page).not.toContain("Closures and exceptions");
        expect(page).not.toContain("No closure provider available");
        expect(page).not.toContain("locations-schedule-closures");
        expect(page).toContain("LocationSchedulePatternCreatePanel");
        expect(page).toContain("LocationSchedulingSurface");
        expect(page).toContain("ConfigChildObjectMasterDetail");
        expect(page).toContain('data-testid="locations-schedule-add"');
        expect(page).toContain("formatSchedulePatternSummary");
        expect(page).toContain("LocationsCommandRailActions");
        expect(page).toContain("buildLocationsRailActions");
        expect(page).not.toContain('data-testid="locations-add-location"');
        expect(page).toContain('data-testid="locations-edit-location"');
        expect(create).toContain("locations-schedule-create-active");
        expect(create).toContain("is_active: active");
        expect(create).toContain("locations-schedule-create-day-type");
        expect(create).toContain("locations-schedule-create-repeats");
        expect(create).toContain("locations-schedule-create-rotation-anchor");
        expect(create).toContain("Scheduled days");
        expect(create).toContain("writeScheduleDefinitionMetadata");
        expect(create).toContain("border-alloy-bend-pine bg-alloy-bend-pine text-white");
        expect(detail).toContain("locations-schedule-edit");
        expect(detail).toContain("locations-schedule-weekdays-view");
        expect(detail).toContain("locations-schedule-day-type");
        expect(detail).toContain("locations-schedule-repeats");
        expect(detail).toContain("locations-schedule-rotation-anchor");
        expect(detail).toContain("schedulePatternTypeLabel");
        expect(detail).toContain("needsDayTypeReview");
        expect(detail).not.toContain("#00a283");
        expect(detail).not.toContain("#007d68");
        expect(presentation).toContain("toSchedulePatternSchedulingContract");
        expect(presentation).toContain("resolveScheduleDefinitionWeekdays");
        expect(presentation).toContain("migrateV1ScheduleMetadata");
        expect(presentation).toContain("needsDayTypeReview");
        expect(presentation).toContain("resolveRotationWeekPosition");
        expect(service).toContain("is_active: input.isActive ?? true");
        expect(route).toContain('typeof body.is_active === "boolean"');
        expect(rail).toContain('id: "configure-capacity"');
        expect(rail).toContain('id: "resolve-timezone"');
        expect(rail).not.toContain('label: "Apply to other locations"');
        expect(rail).toContain('group: "more"');
        const scheduling = read("components/adminV2/settings/locations/LocationSchedulingSurface.tsx");
        const schedulingVm = read("lib/locations/useLocationSchedulingVm.ts");
        expect(scheduling).toContain("DayTypesCatalog");
        expect(scheduling).toContain("ScheduleTypesCatalog");
        expect(scheduling).toContain("HoursCatalog");
        expect(scheduling).toContain("OperatingDaysPanel");
        expect(schedulingVm).toContain("dayTypesCacheByOrg");
        expect(schedulingVm).toContain("useLocationSchedulingVm");
        expect(read("components/adminV2/settings/locations/LocationsCommandRailActions.tsx")).toContain(
            'actionsPlacementSurface="company"',
        );
        expect(read("components/adminV2/settings/locations/LocationsCommandRailActions.tsx")).toContain(
            "More actions",
        );
        expect(page).not.toContain("Publish Communications");
    });

    it("warms Tours from location concern cache without literal Loading text", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        const cache = read("lib/locations/locationConcernCache.ts");
        const tours = read("app/adminV2/settings/tours/availability/TourAvailabilitySettingsClient.tsx");
        expect(page).toContain("loadLocationTourRules");
        expect(page).toContain("setToursKeepAlive(true)");
        expect(cache).toContain("peekLocationTourRules");
        expect(cache).toContain("loadLocationTourRules");
        expect(tours).toContain("peekLocationTourRules");
        expect(tours).toContain("tours-availability-pending");
        expect(tours).not.toContain("Loading…");
        expect(tours).toContain("locations-tour-add-window");
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

    it("Checkpoint B — inherits Configuration Continuity collection and selection", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        const hook = read("components/adminV2/settings/locations/useLocationsConfigurationSettings.ts");
        const cache = read("lib/locations/locationsCollectionCache.ts");
        const adapter = read("lib/locations/locationsSelectionAdapter.ts");
        const continuity = read("lib/configRuntime/configurationContinuity.ts");
        const routes = read("lib/admin/canonicalLocationSettingsRoutes.ts");
        const nextConfig = read("next.config.ts");

        expect(hook).toContain("loadLocationsCollection");
        expect(hook).toContain("resolveLocationsSelection");
        expect(hook).toContain("subscribeConfigurationInvalidation");
        expect(hook).toContain("invalidateLocationsCollection");
        expect(hook).not.toContain("fetchSchedulePatternsForSite");
        expect(cache).toContain("fetchSchedulePatternsForOrg");
        expect(cache).toContain("locations-collection:v1:");
        expect(adapter).toContain('source: "retained"');
        expect(adapter).toContain("shouldSyncRoute");
        expect(page).toContain("retainedLocationId");
        expect(page).toContain("shouldSyncRoute");
        expect(page).toContain("router.push(locationConcernHref");
        expect(page).toContain("router.replace(locationConcernHref(selectedId");
        expect(continuity).toContain("ORGANIZATION_LOCATIONS_PATH");
        expect(routes).toContain('ORGANIZATION_LOCATIONS_PATH = `${CANONICAL_ORGANIZATION_BASE}/locations`');
        expect(nextConfig).toContain('source: "/organization/locations"');
    });

    it("Checkpoint C — nested concern continuity wiring", () => {
        const page = read("components/adminV2/settings/locations/LocationsConfigurationPage.tsx");
        const contract = read("lib/locations/locationConcernContract.ts");
        const cache = read("lib/locations/locationConcernCache.ts");
        const route = read("app/adminV2/settings/locations/page.tsx");
        const panels = read("components/adminV2/settings/locations/LocationOwnedConcernPanels.tsx");
        const tabs = read(
            "components/adminV2/settings/configurationRuntime/workspace/ConfigWorkspaceTabBar.tsx",
        );

        expect(contract).toContain("LOCATION_CONCERN_REGISTRY");
        expect(contract).toContain("shouldApplyLocationConcernResponse");
        expect(cache).toContain("loadLocationAccessMembers");
        expect(cache).toContain("loadLocationPlacementPolicy");
        expect(route).toContain("resolveActiveLocationConcern");
        expect(page).toContain("prefetchConcernIntent");
        expect(page).toContain("locations-access-keepalive");
        expect(page).toContain("onSectionIntent={prefetchConcernIntent}");
        expect(page).toContain("locationConcernHref");
        expect(panels).toContain("projectLocationConcernTransition");
        expect(panels).toContain("loadLocationPlacementPolicy");
        expect(page).toContain("resolveLocationsConcernState");
        expect(page).toContain("retainedConcernTab");
        expect(read("app/adminV2/settings/tours/availability/TourAvailabilitySettingsClient.tsx")).toContain(
            "stale locFilter caused false empties",
        );
        expect(tabs).toContain("onSectionIntent");
    });
});
