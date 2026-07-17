import { describe, expect, it } from "vitest";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";
import {
    buildLocationProgramOperationalSummaries,
    buildLocationWorkspaceModel,
    buildLocationsCollectionModel,
    formatStaffingThreshold,
    locationWorkspaceHref,
    locationsLandingHref,
    normalizeUsLocationTimezone,
    parseStaffingThresholds,
    parseLocationWorkspaceTab,
    serializeStaffingThresholds,
    US_LOCATION_TIMEZONE_OPTIONS,
} from "@/lib/locations/locationWorkspaceModel";

function site(overrides: Partial<LocationHierarchyRow> = {}): LocationHierarchyRow {
    return {
        id: "site-1",
        label: "Downtown Campus",
        location_type: "site",
        parent_location_id: null,
        is_active: true,
        city: "Portland",
        state: "OR",
        address1: "123 Main Street",
        postal_code: "97201",
        metadata: { site_phone: "(503) 555-1234", timezone: "America/Los_Angeles" },
        ...overrides,
    };
}

function room(id: string, metadata: Record<string, unknown>): LocationHierarchyRow {
    return {
        id,
        label: `Room ${id}`,
        location_type: "unit",
        parent_location_id: "site-1",
        is_active: true,
        city: null,
        state: null,
        metadata,
    };
}

function program(id: string): LocationProgramCategoryRow {
    return {
        id,
        org_id: "org-1",
        location_id: "site-1",
        key: id,
        label: `Program ${id}`,
        is_active: true,
    };
}

describe("location workspace model", () => {
    it("builds the healthy multi-program and multi-room state without fabricating enrollment", () => {
        const model = buildLocationWorkspaceModel({
            site: site(),
            rooms: [
                room("a", {
                    capacity: "12",
                    category: "toddler",
                    student_teacher_ratio: "1:5",
                }),
                room("b", {
                    capacity: "18",
                    category: "preschool",
                    student_teacher_ratio: "1:8",
                }),
            ],
            programs: [program("toddler"), program("preschool")],
            schedules: [{ id: "schedule-1", is_active: true }],
            ownedConcernSetup: {
                tours: true,
                placement: true,
                access: true,
            },
        });

        expect(model.configuredCapacity).toBe(30);
        expect(model.activeRoomCount).toBe(2);
        expect(model.activeProgramCount).toBe(2);
        expect(model.setupComplete).toBe(true);
        expect(model.criticalCount).toBe(0);
        expect(model.recommendedCount).toBe(0);
        expect(model.attention).toEqual([]);
    });

    it("keeps unknown capacity unknown and identifies partial setup", () => {
        const model = buildLocationWorkspaceModel({
            site: site(),
            rooms: [
                room("configured", {
                    capacity: "10",
                    category: "toddler",
                    student_teacher_ratio: "1:5",
                }),
                room("unknown", { category: "preschool" }),
            ],
            programs: [program("toddler")],
            schedules: [],
        });

        expect(model.configuredCapacity).toBe(10);
        expect(model.roomsNeedingCapacity).toBe(1);
        expect(model.attention).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ key: "room-capacity", grade: "fix" }),
                expect.objectContaining({ key: "schedule", grade: "improve" }),
            ]),
        );
        expect(model.setupComplete).toBe(false);
        expect(model.criticalCount).toBe(1);
        expect(model.recommendedCount).toBeGreaterThan(0);
    });

    it("represents an unconfigured location with honest nulls rather than zero", () => {
        const model = buildLocationWorkspaceModel({
            site: site({
                address1: null,
                city: null,
                state: null,
                postal_code: null,
                metadata: {},
            }),
            rooms: [],
            programs: [],
            schedules: [],
        });

        expect(model.configuredCapacity).toBeNull();
        expect(model.address).toBeNull();
        expect(model.phone).toBeNull();
        expect(model.timezone).toBeNull();
        expect(model.setupPercent).toBe(0);
        expect(model.attention.map((item) => item.key)).toEqual(["timezone", "rooms", "programs", "schedule"]);
    });

    it("excludes unknown readiness areas from the setup denominator", () => {
        const model = buildLocationWorkspaceModel({
            site: site(),
            rooms: [
                room("a", {
                    capacity: "12",
                    category: "toddler",
                    student_teacher_ratio: "1:5",
                }),
            ],
            programs: [program("toddler")],
            schedules: [{ id: "schedule-1", is_active: true }],
            // tours/placement/access omitted → null/unknown
        });

        expect(model.setupPercent).toBe(100);
        expect(model.setupComplete).toBe(true);
        expect(model.setupItems.filter((item) => item.complete === null).map((item) => item.key)).toEqual([
            "tours",
            "placement",
            "access",
        ]);
        expect(model.recommendedCount).toBe(0);
    });

    it("keeps selected location, tab, and nested item URL-addressable", () => {
        expect(locationsLandingHref()).toBe("/settings/locations");
        expect(locationWorkspaceHref("site-1", "rooms", "room-2")).toBe(
            "/settings/locations?locationId=site-1&tab=rooms&itemId=room-2",
        );
        expect(parseLocationWorkspaceTab("communications")).toBe("overview");
        expect(parseLocationWorkspaceTab("unknown")).toBe("overview");
    });

    it("builds an organization Location collection rollup without auto-selecting a location", () => {
        const collection = buildLocationsCollectionModel({
            sites: [
                site(),
                site({
                    id: "site-2",
                    label: "West Campus",
                    city: "Beaverton",
                    address1: null,
                    metadata: {},
                }),
            ],
            rooms: [
                room("a", {
                    capacity: "12",
                    category: "toddler",
                    student_teacher_ratio: "1:5",
                }),
            ],
            programs: [program("toddler")],
            schedules: [{ id: "schedule-1", site_location_id: "site-1", is_active: true }],
        });

        expect(collection.locationCount).toBe(2);
        expect(collection.activeLocationCount).toBe(2);
        expect(collection.totalRooms).toBe(1);
        expect(collection.totalPrograms).toBe(1);
        expect(collection.totalConfiguredCapacity).toBe(12);
        expect(collection.locations[0]?.id).toBe("site-2");
        expect(collection.locations[0]?.criticalCount).toBeGreaterThan(0);
        expect(collection.attentionHighlights.length).toBeGreaterThan(0);
        expect(collection.locations.find((location) => location.id === "site-1")?.setupComplete).toBe(true);
    });

    it("limits location timezone choices to canonical United States IANA values", () => {
        expect(US_LOCATION_TIMEZONE_OPTIONS).toEqual([
            { label: "Eastern Time", value: "America/New_York" },
            { label: "Central Time", value: "America/Chicago" },
            { label: "Mountain Time", value: "America/Denver" },
            { label: "Arizona", value: "America/Phoenix" },
            { label: "Pacific Time", value: "America/Los_Angeles" },
            { label: "Alaska Time", value: "America/Anchorage" },
            { label: "Hawaii Time", value: "Pacific/Honolulu" },
        ]);
        expect(normalizeUsLocationTimezone(" America/Chicago ")).toBe("America/Chicago");
        expect(normalizeUsLocationTimezone("America/Toronto")).toBeNull();
        expect(normalizeUsLocationTimezone("UTC")).toBeNull();
    });

    it("supports threshold staffing while preserving legacy one-to-five values", () => {
        const thresholds = parseStaffingThresholds("1:5, 2–11\n3-17");
        expect(thresholds).toEqual([
            { requiredStaff: 1, maxChildren: 5 },
            { requiredStaff: 2, maxChildren: 11 },
            { requiredStaff: 3, maxChildren: 17 },
        ]);
        expect(thresholds.map(formatStaffingThreshold)).toEqual(["1–5", "2–11", "3–17"]);
        expect(serializeStaffingThresholds(thresholds)).toBe("1:5,2:11,3:17");
    });

    it("builds program cards from the rooms and capacity each program serves", () => {
        const programs = [
            {
                ...program("toddler"),
                label: "Toddler",
                metadata: {
                    age_range_from: "18",
                    age_range_to: "36",
                    age_range_unit: "months",
                },
            },
        ];
        const summaries = buildLocationProgramOperationalSummaries({
            programs,
            rooms: [
                room("a", { category: "toddler", capacity: "11" }),
                room("b", { category: "toddler", capacity: "17" }),
                room("c", { category: "preschool", capacity: "20" }),
            ],
        });

        expect(summaries).toEqual([
            expect.objectContaining({
                label: "Toddler",
                roomCount: 2,
                configuredCapacity: 28,
                ageRange: "18–36 months",
                isActive: true,
            }),
        ]);
    });
});
