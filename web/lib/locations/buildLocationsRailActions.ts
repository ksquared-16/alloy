import type { LocationsRailAction } from "@/components/adminV2/settings/locations/LocationsCommandRailActions";
import type { LocationWorkspaceModel, LocationWorkspaceTab } from "@/lib/locations/locationWorkspaceModel";

type BuildArgs = {
    activeTab: LocationWorkspaceTab;
    canMutate: boolean;
    model: LocationWorkspaceModel | null;
    selectedSite: boolean;
    scheduleCount: number;
    roomCount: number;
    programCount: number;
    hasSelectedProgram: boolean;
    hasSelectedRoom: boolean;
    roomsNeedingCapacity: number;
    /** First room missing capacity — used by Fix capacity actions. */
    firstRoomNeedingCapacityId: string | null;
    onAddLocation: () => void;
    onEditLocation: () => void;
    onAddRoom: () => void;
    onAddProgram: () => void;
    onNavigate: (tab: LocationWorkspaceTab, itemId?: string | null) => void;
    onCreateSchedule: () => void;
};

/**
 * Curated Location Actions — Fix now / Do next / Manage / More.
 * Every visible action must execute or be intentionally disabled with a reason.
 */
export function buildLocationsRailActions(args: BuildArgs): LocationsRailAction[] {
    if (!args.selectedSite) {
        return args.canMutate ?
                [
                    {
                        id: "add-location",
                        label: "Add location",
                        group: "manage",
                        onClick: args.onAddLocation,
                    },
                ]
            :   [];
    }

    if (!args.model) return [];

    const openCapacityWork = () => {
        args.onNavigate("rooms", args.firstRoomNeedingCapacityId);
    };

    if (args.activeTab === "overview") {
        const actions: LocationsRailAction[] = [];

        if (!args.model.timezone) {
            actions.push({
                id: "resolve-timezone",
                label: "Set time zone",
                group: "fix",
                reason: "Required for hours and tours",
                onClick: args.onEditLocation,
            });
        }
        if (args.roomsNeedingCapacity > 0 || args.model.configuredCapacity == null) {
            actions.push({
                id: "configure-capacity",
                label: "Set room capacity",
                group: "fix",
                reason:
                    args.roomsNeedingCapacity > 0 ?
                        `${args.roomsNeedingCapacity} rooms need setup`
                    :   "No capacity set yet",
                onClick: openCapacityWork,
            });
        }

        if (args.scheduleCount === 0) {
            actions.push({
                id: "set-schedule",
                label: "Set operating hours",
                group: "next",
                reason: "Weekly hours are not set yet",
                onClick: () => args.onNavigate("schedule"),
            });
        }
        if (args.model.setupItems.find((item) => item.key === "tours")?.complete === false) {
            actions.push({
                id: "review-tours",
                label: "Review tour availability",
                group: "next",
                onClick: () => args.onNavigate("tours"),
            });
        }
        if (args.canMutate && args.roomCount === 0) {
            actions.push({
                id: "add-room",
                label: "Add room",
                group: "next",
                reason: "Start capacity setup",
                onClick: args.onAddRoom,
            });
        } else if (args.canMutate && args.programCount === 0) {
            actions.push({
                id: "offer-programs",
                label: "Offer a program",
                group: "next",
                onClick: args.onAddProgram,
            });
        }

        // Primary "Edit location" lives on the object header (not duplicated here).

        if (args.canMutate && args.roomCount > 0) {
            actions.push({
                id: "add-room-more",
                label: "Add room",
                group: "more",
                onClick: args.onAddRoom,
            });
        }
        if (args.canMutate && args.programCount > 0) {
            actions.push({
                id: "add-program-more",
                label: "Add program",
                group: "more",
                onClick: args.onAddProgram,
            });
        }
        actions.push(
            {
                id: "go-rooms",
                label: "Open rooms",
                group: "more",
                onClick: () => args.onNavigate("rooms"),
            },
            {
                id: "go-programs",
                label: "Open programs",
                group: "more",
                onClick: () => args.onNavigate("programs"),
            },
            {
                id: "go-schedule",
                label: "Open schedule",
                group: "more",
                onClick: () => args.onNavigate("schedule"),
            },
        );
        return actions;
    }

    if (args.activeTab === "programs") {
        // Collection chrome owns Add. Cross-location apply stays hidden until
        // an authoritative copy substrate exists.
        return [];
    }

    if (args.activeTab === "rooms") {
        const actions: LocationsRailAction[] = [];
        if (args.roomsNeedingCapacity > 0 || args.model.configuredCapacity == null) {
            actions.push({
                id: "configure-capacity",
                label: "Set room capacity",
                group: "fix",
                reason:
                    args.roomsNeedingCapacity > 0 ?
                        `${args.roomsNeedingCapacity} rooms need setup`
                    :   undefined,
                onClick: openCapacityWork,
            });
        }
        if (args.canMutate) {
            actions.push({
                id: "add-room",
                label: "Add room",
                group: "next",
                onClick: args.onAddRoom,
            });
        }
        return actions;
    }

    if (args.activeTab === "schedule") {
        const actions: LocationsRailAction[] = [];
        if (args.scheduleCount === 0) {
            actions.push({
                id: "add-schedule-pattern",
                label: "Add schedule pattern",
                group: "fix",
                disabled: !args.canMutate,
                reason: !args.canMutate ? "You do not have permission" : undefined,
                onClick: args.onCreateSchedule,
            });
        } else if (args.canMutate) {
            actions.push({
                id: "add-schedule-pattern",
                label: "Add schedule pattern",
                group: "next",
                onClick: args.onCreateSchedule,
            });
        }
        return actions;
    }

    if (args.activeTab === "tours") {
        return [];
    }

    if (args.activeTab === "placement") {
        return [
            {
                id: "review-rooms",
                label: "Review rooms",
                group: "manage",
                reason: "Placement uses active rooms",
                onClick: () => args.onNavigate("rooms"),
            },
        ];
    }

    if (args.activeTab === "access") {
        // Edit location is owned by the object header.
        return [];
    }

    return [];
}
