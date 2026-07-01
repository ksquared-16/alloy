import type { DrawerTabKey } from "@/lib/entityPresentation";
import type { WorkUnitAboveFoldRenderModel } from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/aboveFoldTypes";

/** Frozen route chrome — structure only; lists/metrics hydrate in regions. */
export type RouteShellContract = {
    route_id: "workspace" | "department" | "work_unit";
    layout_version: string;
    breadcrumbs: Array<{ label: string; href?: string }>;
    title: string;
    subtitle?: string;
    /** Region slots with lifecycle (immediate | reserved_placeholder | deferred). */
    regions: RouteRegionSlot[];
    geometry: Record<string, unknown>;
};

export type RouteRegionLifecycle = "immediate" | "reserved_placeholder" | "deferred";

export type RouteRegionSlot = {
    region_key: string;
    lifecycle: RouteRegionLifecycle;
    shell_min_height_class?: string;
};

export type RouteRecordSurface = "bootstrap" | "primary" | "full" | string;

export type RouteEnrichmentState = {
    record_surface: RouteRecordSurface;
    primary_loaded: boolean;
    full_pending: boolean;
    full_complete: boolean;
    background_full_failed: boolean;
};

export type RouteHydrationPlan = {
    route_id: RouteShellContract["route_id"];
    surfaces: {
        bootstrap: { enabled: boolean; owner: "segment" | "page" };
        primary: { enabled: boolean };
        full: { enabled: boolean; deferred: boolean };
    };
};

export type RouteSectionValuePhase = "skeleton" | "value" | "empty_confirmed" | "error";

export type RouteSectionRenderModel = {
    region_key: string;
    lifecycle: RouteRegionLifecycle;
    value_phase: RouteSectionValuePhase;
    shell_min_height_class?: string;
};

/** Above-fold route regions — header, queue lane, KPI strip, etc. */
export type RouteAboveFoldRenderModel = {
    header_ready: boolean;
    queue_lane: {
        reserved: boolean;
        value_phase: RouteSectionValuePhase;
        oper_lane_loading: boolean;
    };
    kpi_strip: {
        reserved: boolean;
        value_phase: RouteSectionValuePhase;
        placeholder: boolean;
    };
    sections: RouteSectionRenderModel[];
};

export type RoutePipelineState = {
    shell: RouteShellContract;
    enrichment: RouteEnrichmentState;
    hydration_plan: RouteHydrationPlan;
    above_fold: RouteAboveFoldRenderModel;
    /** Work-unit only — atomic header / actions / queue lane contract. */
    work_unit_above_fold?: WorkUnitAboveFoldRenderModel;
};

/** @deprecated Use route_id-specific contracts; kept for cross-route docs. */
export type RouteTabKey = DrawerTabKey;
