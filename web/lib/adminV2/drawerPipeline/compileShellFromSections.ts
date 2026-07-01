import type { DrawerTabKey } from "@/lib/entityPresentation";
import type { EntityDrawerSectionConfig } from "@/lib/entityPresentation";
import type { DrawerSectionLifecycle, DrawerSectionSlot, DrawerShellContract } from "@/lib/adminV2/drawerPipeline/types";

export type CompileDrawerShellFromSectionsInput = {
    entity_type: string;
    layout_version: string;
    tabs: DrawerTabKey[];
    overview_sections: EntityDrawerSectionConfig[];
    /** Per-section lifecycle; omitted sections default to immediate. */
    section_lifecycle?: Partial<Record<string, DrawerSectionLifecycle>>;
    geometry?: Record<string, unknown>;
    layout_config_snapshot?: Record<string, unknown>;
};

function slotForSection(
    section_key: string,
    lifecycle_map: Partial<Record<string, DrawerSectionLifecycle>> | undefined
): DrawerSectionSlot {
    return {
        section_key,
        lifecycle: lifecycle_map?.[section_key] ?? "immediate",
    };
}

/** Generic shell compiler — entity adapters supply sections + lifecycle map only. */
export function compileDrawerShellFromSections(input: CompileDrawerShellFromSectionsInput): DrawerShellContract {
    const section_slots = input.overview_sections.map((s) => slotForSection(s.key, input.section_lifecycle));
    return {
        entity_type: input.entity_type,
        layout_version: input.layout_version,
        tabs: input.tabs,
        overview_sections: input.overview_sections,
        section_slots,
        geometry: { ...(input.geometry ?? {}) },
        layout_config_snapshot: { ...(input.layout_config_snapshot ?? {}) },
    };
}
