import type { DrawerFirstPaintContract, DrawerFirstPaintDependencyState } from "@/lib/adminV2/viewModel/drawer/firstPaintTypes";
import type { PersonOperatingSectionKey } from "@/lib/admin/person/personDrawerLayoutRuntime";

/** Person drawer VM chrome surface — child is a separate flag/cutover path. */
export type PersonDrawerVmSurface = "parent" | "generic";

export type PersonDrawerFirstPaintViewportSlot =
    | "header"
    | "status"
    | "title"
    | "lifecycle_rail"
    | "summary"
    | "household"
    | "household_address"
    | "employee_status"
    | "bos_panel";

export type PersonDrawerFirstPaintDependencyKey =
    | "record_full"
    | "status_definitions"
    | "composed_sections";

export type PersonDrawerFirstPaintDependencyState =
    DrawerFirstPaintDependencyState<PersonDrawerFirstPaintDependencyKey>;

export type PersonDrawerFirstPaintContract = DrawerFirstPaintContract<
    PersonDrawerFirstPaintDependencyKey,
    PersonDrawerFirstPaintViewportSlot
>;

export type PersonDrawerViewModel = {
    generation: string;
    structureSettled: true;
    compose_version: string;
    entity: { type: "person"; id: string };
    surface: PersonDrawerVmSurface;
    first_paint: PersonDrawerFirstPaintContract;
    header: {
        title: string;
        subtitle: string | null;
        status_label: string | null;
    };
    record: Record<string, unknown>;
    layout: {
        variant_key: string;
        operating_sections: PersonOperatingSectionKey[];
    };
    background_refresh: {
        allowed: readonly ("status_values" | "record_visibility")[];
    };
    timing: {
        compose_ms: number;
        phases_ms: Record<string, number>;
    };
};

export type PersonDrawerViewModelSkipped = {
    structureSettled: false;
    reason: "person_not_found" | "surface_not_supported" | "composed_not_ready";
    compose_version: string;
};

export type PersonDrawerViewModelResult =
    | { ok: true; viewModel: PersonDrawerViewModel }
    | { ok: false; skipped: PersonDrawerViewModelSkipped };
