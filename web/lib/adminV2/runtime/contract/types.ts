import type { DrawerTabKey } from "@/lib/entityPresentation";

/** Drawer body surfaces governed by the runtime composer (not section-local loading). */
export type AdminV2DrawerSurface = "opportunity" | "parent" | "child" | "generic";

export type DrawerSectionFallbackMode =
    | "hidden"
    | "reserved"
    | "skeleton-inside-reserved-box"
    | "block-drawer-reveal";

/** Final geometry reservation — sections must not resize the drawer after first paint. */
export type DrawerSectionReservedLayout = {
    minHeightClass: string;
    /** Optional data attribute for contract tests / debugging. */
    reserveVariant?: string;
};

export type DrawerSectionRenderContext = {
    record: Record<string, unknown>;
    bodyHydrated: boolean;
    typedSnapshot: boolean;
    fullHydrateReady: boolean;
    drawerId: string;
};

export type AdminV2DrawerEntityType = "opportunities" | "persons" | "jobs" | "schedules" | "locations" | "generic";

export type ComposeAdminV2DrawerRuntimeInput = {
    entityType: AdminV2DrawerEntityType;
    surface: AdminV2DrawerSurface;
    drawerId: string | null;
    activeTab: DrawerTabKey;
    record: Record<string, unknown> | null;
    error: string | null;
    typedSnapshot: boolean;
    bodyHydrated: boolean;
    fullHydrateReady: boolean;
    frameReady: boolean;
    headerActionsResolved: boolean;
    headerActionsLoading: boolean;
    headerActionsExpectRegistry: boolean;
    inquiryWorkflow: boolean;
    belowFoldRevealed: boolean;
    presentationReady: boolean;
    primaryContractReady: boolean;
    needsBackgroundHydrate: boolean;
};

export type AdminV2DrawerRuntimePlan = {
    canRevealDrawerFrame: boolean;
    canRevealHeaderActions: boolean;
    canRevealActiveTab: boolean;
    sectionsToRender: string[];
    sectionsReserved: string[];
    sectionsBlocking: string[];
    backgroundHydrateNeeded: boolean;
};

export type AdminV2QueueLaneRevealState =
    | "hidden_until_settled"
    | "ready_with_cache"
    | "ready_with_rows"
    | "ready_empty"
    | "ready_error";
