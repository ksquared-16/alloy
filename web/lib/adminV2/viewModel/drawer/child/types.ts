import type { DrawerFirstPaintContract, DrawerFirstPaintDependencyState } from "@/lib/adminV2/viewModel/drawer/firstPaintTypes";

export type ChildDrawerFirstPaintViewportSlot =
    | "header"
    | "title"
    | "header_chips"
    | "lifecycle_rail"
    | "child_summary"
    | "household"
    | "medical"
    | "bos_panel";

export type ChildDrawerFirstPaintDependencyKey = "record_full" | "status_definitions" | "composed_sections";

export type ChildDrawerFirstPaintDependencyState =
    DrawerFirstPaintDependencyState<ChildDrawerFirstPaintDependencyKey>;

export type ChildDrawerFirstPaintContract = DrawerFirstPaintContract<
    ChildDrawerFirstPaintDependencyKey,
    ChildDrawerFirstPaintViewportSlot
>;

export type ChildDrawerViewModel = {
    generation: string;
    structureSettled: true;
    compose_version: string;
    entity: { type: "person"; id: string };
    surface: "child";
    first_paint: ChildDrawerFirstPaintContract;
    header: {
        title: string;
        subtitle: string | null;
        status_label: string | null;
    };
    record: Record<string, unknown>;
    layout: {
        variant_key: string;
        operating_sections: readonly ("child_summary" | "household")[];
    };
    background_refresh: {
        allowed: readonly ("status_values")[];
    };
    timing: {
        compose_ms: number;
        phases_ms: Record<string, number>;
    };
};

export type ChildDrawerViewModelSkipped = {
    structureSettled: false;
    reason: "person_not_found" | "surface_not_supported" | "composed_not_ready";
    compose_version: string;
};

export type ChildDrawerViewModelResult =
    | { ok: true; viewModel: ChildDrawerViewModel }
    | { ok: false; skipped: ChildDrawerViewModelSkipped };
