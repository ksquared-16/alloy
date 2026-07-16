import type { LocationsRailAction } from "@/components/adminV2/settings/locations/LocationsCommandRailActions";
import type { LocationWorkspaceModel, LocationWorkspaceTab } from "@/lib/locations/locationWorkspaceModel";

type BuildArgs = {
    activeTab: LocationWorkspaceTab;
    canMutate: boolean;
    model: LocationWorkspaceModel | null;
    selectedSite: boolean;
    siteCount: number;
    scheduleCount: number;
    roomCount: number;
    programCount: number;
    hasSelectedProgram: boolean;
    hasSelectedRoom: boolean;
    roomsNeedingCapacity: number;
    onAddLocation: () => void;
    onEditLocation: () => void;
    onAddRoom: () => void;
    onNavigate: (tab: LocationWorkspaceTab, itemId?: string | null) => void;
    onApply: () => void;
    onCreateSchedule: () => void;
};

/**
 * Curated Location Actions — Fix now / Do next / Manage / More.
 * Navigation-only items stay behind More. Executable gap-closing stays primary.
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

    const applyDisabled = !args.canMutate || args.siteCount < 2;
    const applyReason =
        !args.canMutate ? "You do not have permission"
        : args.siteCount < 2 ? "Need at least two locations"
        : undefined;

    const applyAction = (id: string, label: string): LocationsRailAction => ({
        id,
        label,
        group: "manage",
        disabled: applyDisabled,
        reason: applyReason,
        onClick: args.onApply,
    });

    if (args.activeTab === "overview") {
        const actions: LocationsRailAction[] = [];

        if (!args.model.timezone) {
            actions.push({
                id: "resolve-timezone",
                label: "Set time zone",
                group: "fix",
                reason: "Required for schedules and tours",
                onClick: args.onEditLocation,
            });
        }
        if (args.roomsNeedingCapacity > 0 || args.model.configuredCapacity == null) {
            actions.push({
                id: "configure-capacity",
                label: "Configure capacity",
                group: "fix",
                reason:
                    args.roomsNeedingCapacity > 0 ?
                        `${args.roomsNeedingCapacity} rooms need setup`
                    :   "No capacity configured yet",
                onClick: () => args.onNavigate("rooms"),
            });
        }

        if (args.scheduleCount === 0) {
            actions.push({
                id: "set-schedule",
                label: "Set operating hours",
                group: "next",
                reason: "Weekly hours are not set up yet",
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
                onClick: () => args.onNavigate("programs"),
            });
        }

        actions.push(applyAction("apply-to", "Apply configuration"));
        if (args.canMutate) {
            actions.push({
                id: "edit-details",
                label: "Edit location",
                group: "manage",
                onClick: args.onEditLocation,
            });
        }

        if (args.canMutate && args.roomCount > 0) {
            actions.push({
                id: "add-room-more",
                label: "Add room",
                group: "more",
                onClick: args.onAddRoom,
            });
        }
        actions.push(
            {
                id: "duplicate-location",
                label: "Duplicate location",
                group: "more",
                disabled: true,
                reason: "Coming soon",
                onClick: () => undefined,
            },
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
        );
        return actions;
    }

    if (args.activeTab === "programs") {
        const actions: LocationsRailAction[] = [];
        const incompleteProgram =
            args.hasSelectedProgram &&
            args.model.setupItems.find((item) => item.key === "programs")?.complete === false;
        if (incompleteProgram || args.programCount === 0) {
            actions.push({
                id: "complete-program",
                label: args.programCount === 0 ? "Offer a program" : "Complete program setup",
                group: "fix",
                reason: args.programCount === 0 ? "No programs offered yet" : "Selected program needs setup",
                onClick: () => args.onNavigate("programs"),
            });
        }
        if (args.canMutate) {
            actions.push({
                id: "add-program",
                label: "Add program",
                group: "next",
                disabled: true,
                reason: "Program create flow connects next",
                onClick: () => undefined,
            });
        }
        actions.push(applyAction("apply-programs", "Apply programs"));
        return actions;
    }

    if (args.activeTab === "rooms") {
        const actions: LocationsRailAction[] = [];
        if (args.roomsNeedingCapacity > 0 || args.model.configuredCapacity == null) {
            actions.push({
                id: "configure-capacity",
                label: "Configure room capacity",
                group: "fix",
                reason:
                    args.roomsNeedingCapacity > 0 ?
                        `${args.roomsNeedingCapacity} rooms need setup`
                    :   undefined,
                onClick: () => args.onNavigate("rooms"),
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
        actions.push(applyAction("apply-rooms", "Apply room configuration"));
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
        actions.push(applyAction("apply-schedule", "Apply schedule configuration"));
        actions.push({
            id: "add-closure",
            label: "Add closure",
            group: "more",
            disabled: true,
            reason: "Not available yet",
            onClick: () => undefined,
        });
        return actions;
    }

    if (args.activeTab === "tours") {
        return [
            {
                id: "review-availability",
                label: "Review availability",
                group: "manage",
                onClick: () => args.onNavigate("tours"),
            },
            applyAction("apply-tours", "Apply tour configuration"),
        ];
    }

    if (args.activeTab === "placement") {
        return [
            {
                id: "configure-ranking",
                label: "Configure ranking",
                group: "manage",
                onClick: () => args.onNavigate("placement"),
            },
        ];
    }

    if (args.activeTab === "access") {
        return [
            {
                id: "manage-access",
                label: "Manage access",
                group: "manage",
                onClick: () => args.onNavigate("access"),
            },
        ];
    }

    return [];
}
