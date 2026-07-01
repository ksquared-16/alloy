/**
 * Shared route-loading copy for AdminV2 workspace hierarchy transitions.
 * Used by `AdminV2RouteLoadingState` and navigation transition orchestration.
 */

export type AdminV2RouteLoadingVariant = "workspace" | "department" | "work_unit" | "queue";

export type AdminV2RouteLoadingVocabulary = {
    title: string;
    description: string;
    ribbon: string;
};

export const ADMIN_V2_ROUTE_LOADING_VOCABULARY: Record<AdminV2RouteLoadingVariant, AdminV2RouteLoadingVocabulary> = {
    workspace: {
        title: "Preparing workspace",
        description: "Loading departments and organization context…",
        ribbon: "Loading workspace",
    },
    department: {
        title: "Loading department",
        description: "Fetching department details…",
        ribbon: "Loading department",
    },
    work_unit: {
        title: "Loading work unit",
        description: "Fetching queues and actions for this lane…",
        ribbon: "Loading work unit",
    },
    queue: {
        title: "Preparing queue",
        description: "Loading records for the selected lane…",
        ribbon: "Loading queue",
    },
};

export function adminV2RouteLoadingVocabulary(
    variant: AdminV2RouteLoadingVariant
): AdminV2RouteLoadingVocabulary {
    return ADMIN_V2_ROUTE_LOADING_VOCABULARY[variant];
}
