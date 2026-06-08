import type { DrawerAboveFoldRenderModel, DrawerShellContract } from "@/lib/adminV2/drawerPipeline/types";
import type { EntityDrawerSectionConfig } from "@/lib/entityPresentation";

/** Apply section render models onto frozen shell overview config (structure only). */
export function overviewSectionsFromAboveFoldModel(
    shell: DrawerShellContract,
    section_models: DrawerAboveFoldRenderModel["sections"]
): EntityDrawerSectionConfig[] {
    const byKey = new Map(section_models.map((m) => [m.section_key, m]));
    return shell.overview_sections.map((s) => {
        const m = byKey.get(s.key);
        if (!m) return s;
        return {
            ...s,
            defaultExpanded: m.default_expanded,
            collapsible: m.collapsible,
        };
    });
}
