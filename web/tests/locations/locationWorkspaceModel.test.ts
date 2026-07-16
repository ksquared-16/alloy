import { describe, expect, it } from "vitest";
import type { LocationHierarchyRow } from "@/lib/adminV2/locationsHierarchyTablePresentation";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";
import {
    buildLocationWorkspaceModel,
    locationWorkspaceHref,
    parseLocationWorkspaceTab,
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
                room("a", { capacity: "12", category: "toddler", student_teacher_ratio: "1:5" }),
                room("b", { capacity: "18", category: "preschool", student_teacher_ratio: "1:8" }),
            ],
            programs: [program("toddler"), program("preschool")],
            schedules: [{ id: "schedule-1", is_active: true }],
            ownedConcernSetup: {
                tours: true,
                placement: true,
                communications: true,
                access: true,
            },
        });

        expect(model.configuredCapacity).toBe(30);
        expect(model.activeRoomCount).toBe(2);
        expect(model.activeProgramCount).toBe(2);
        expect(model.setupComplete).toBe(true);
        expect(model.attention).toEqual([
            expect.objectContaining({ key: "all-good", grade: "good", label: "Everything looks good" }),
        ]);
    });

    it("keeps unknown capacity unknown and identifies partial setup", () => {
        const model = buildLocationWorkspaceModel({
            site: site(),
            rooms: [
                room("configured", { capacity: "10", category: "toddler", student_teacher_ratio: "1:5" }),
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

    it("keeps selected location, tab, and nested item URL-addressable", () => {
        expect(locationWorkspaceHref("site-1", "rooms", "room-2")).toBe(
            "/settings/locations?locationId=site-1&tab=rooms&itemId=room-2",
        );
        expect(parseLocationWorkspaceTab("communications")).toBe("communications");
        expect(parseLocationWorkspaceTab("unknown")).toBe("overview");
    });
});
