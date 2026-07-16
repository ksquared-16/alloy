import { describe, expect, it, vi } from "vitest";
import { buildLocationsRailActions } from "@/lib/locations/buildLocationsRailActions";
import type { LocationWorkspaceModel } from "@/lib/locations/locationWorkspaceModel";

function model(overrides: Partial<LocationWorkspaceModel> = {}): LocationWorkspaceModel {
    return {
        displayName: "Bend",
        address: "1 Main",
        phone: null,
        timezone: "America/Los_Angeles",
        activeRoomCount: 2,
        activeProgramCount: 1,
        configuredCapacity: 24,
        roomsNeedingCapacity: 0,
        setupPercent: 80,
        setupComplete: false,
        setupItems: [
            { key: "general", label: "General", tab: "general", complete: true },
            { key: "programs", label: "Programs", tab: "programs", complete: true },
            { key: "rooms", label: "Rooms", tab: "rooms", complete: true },
            { key: "schedule", label: "Schedule", tab: "schedule", complete: true },
            { key: "tours", label: "Tours", tab: "tours", complete: true },
            { key: "placement", label: "Placement", tab: "placement", complete: true },
            { key: "access", label: "Access", tab: "access", complete: true },
        ],
        attention: [{ key: "all-good", grade: "good", label: "Everything looks good", tab: "overview" }],
        criticalCount: 0,
        recommendedCount: 0,
        ...overrides,
    };
}

describe("buildLocationsRailActions", () => {
    const handlers = {
        onAddLocation: vi.fn(),
        onEditLocation: vi.fn(),
        onAddRoom: vi.fn(),
        onNavigate: vi.fn(),
        onApply: vi.fn(),
        onCreateSchedule: vi.fn(),
    };

    it("curates overview into Fix / Do next / Manage / More without nav dump", () => {
        const actions = buildLocationsRailActions({
            activeTab: "overview",
            canMutate: true,
            model: model({ timezone: null, roomsNeedingCapacity: 1, configuredCapacity: null }),
            selectedSite: true,
            siteCount: 3,
            scheduleCount: 0,
            roomCount: 2,
            programCount: 1,
            hasSelectedProgram: false,
            hasSelectedRoom: false,
            roomsNeedingCapacity: 1,
            ...handlers,
        });

        expect(actions.filter((action) => action.group === "fix").map((action) => action.id)).toEqual([
            "resolve-timezone",
            "configure-capacity",
        ]);
        expect(actions.some((action) => action.id === "set-schedule" && action.group === "next")).toBe(true);
        expect(actions.some((action) => action.id === "apply-to" && action.group === "manage")).toBe(true);
        expect(actions.some((action) => action.id === "edit-details" && action.group === "manage")).toBe(true);
        expect(actions.some((action) => action.id === "duplicate-location" && action.group === "more")).toBe(true);
        expect(actions.some((action) => action.id === "go-rooms" && action.group === "more")).toBe(true);
        expect(actions.some((action) => action.id === "manage-rooms")).toBe(false);
        expect(actions.filter((action) => action.group !== "more").length).toBeLessThanOrEqual(8);
    });

    it("keeps Add location only on the organization landing", () => {
        const actions = buildLocationsRailActions({
            activeTab: "overview",
            canMutate: true,
            model: null,
            selectedSite: false,
            siteCount: 2,
            scheduleCount: 0,
            roomCount: 0,
            programCount: 0,
            hasSelectedProgram: false,
            hasSelectedRoom: false,
            roomsNeedingCapacity: 0,
            ...handlers,
        });
        expect(actions).toEqual([
            expect.objectContaining({ id: "add-location", group: "manage", label: "Add location" }),
        ]);
    });

    it("does not promote navigation-only room/program manage commands on rooms tab", () => {
        const actions = buildLocationsRailActions({
            activeTab: "rooms",
            canMutate: true,
            model: model({ roomsNeedingCapacity: 2 }),
            selectedSite: true,
            siteCount: 2,
            scheduleCount: 1,
            roomCount: 3,
            programCount: 1,
            hasSelectedProgram: false,
            hasSelectedRoom: true,
            roomsNeedingCapacity: 2,
            ...handlers,
        });
        expect(actions.map((action) => action.id)).toEqual([
            "configure-capacity",
            "add-room",
            "apply-rooms",
        ]);
        expect(actions.some((action) => action.id === "adjust-room")).toBe(false);
    });
});
