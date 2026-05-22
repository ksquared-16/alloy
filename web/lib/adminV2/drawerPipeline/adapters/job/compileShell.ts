import type { DrawerTabKey } from "@/lib/entityPresentation";
import { compileDrawerShellFromSections } from "@/lib/adminV2/drawerPipeline/compileShellFromSections";
import { JOB_DRAWER_V2_OVERVIEW_SECTIONS } from "@/lib/adminV2/drawerPipeline/adapters/job/sections";
import { JOB_DEFERRED_OVERVIEW_SECTION_KEYS } from "@/lib/adminV2/drawerPipeline/adapters/job/deferredSections";
import type { DrawerShellContract } from "@/lib/adminV2/drawerPipeline/types";
import type { DrawerSectionLifecycle } from "@/lib/adminV2/drawerPipeline/types";

function lifecycleForSection(section_key: string): DrawerSectionLifecycle {
    if (JOB_DEFERRED_OVERVIEW_SECTION_KEYS.has(section_key)) return "below_fold_deferred";
    return "immediate";
}

export type CompileJobDrawerShellInput = {
    tabs: DrawerTabKey[];
    variant?: "adminV2";
};

export function compileJobDrawerShell(input: CompileJobDrawerShellInput): DrawerShellContract {
    const section_lifecycle: Partial<Record<string, DrawerSectionLifecycle>> = {};
    for (const s of JOB_DRAWER_V2_OVERVIEW_SECTIONS) {
        section_lifecycle[s.key] = lifecycleForSection(s.key);
    }
    return compileDrawerShellFromSections({
        entity_type: "job",
        layout_version: "job-drawer-v2",
        tabs: input.tabs,
        overview_sections: JOB_DRAWER_V2_OVERVIEW_SECTIONS,
        section_lifecycle,
        geometry: {
            header_signals_reserved: true,
            property_service_expanded: true,
        },
        layout_config_snapshot: { drawer_variant: input.variant ?? "adminV2" },
    });
}
