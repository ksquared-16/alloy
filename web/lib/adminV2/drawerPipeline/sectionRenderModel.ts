import type {
    DrawerEnrichmentState,
    DrawerSectionLifecycle,
    DrawerSectionRenderModel,
    DrawerSectionSlot,
    DrawerSectionValuePhase,
    DrawerShellContract,
} from "@/lib/adminV2/drawerPipeline/types";
import type { EntityDrawerSectionConfig } from "@/lib/entityPresentation";

export type StabilizeSectionsParams = {
    above_fold_locked: boolean;
    deferred_section_keys: ReadonlySet<string>;
    /** When unlocked, filter deferred sections for first paint. */
    filter_deferred_when_unlocked?: (
        sections: EntityDrawerSectionConfig[],
        first_paint_gates_active: boolean,
        enrichment_layout_ready: boolean,
        enrichment_held?: boolean
    ) => EntityDrawerSectionConfig[];
    first_paint_gates_active?: boolean;
    enrichment_layout_ready?: boolean;
    enrichment_held?: boolean;
};

function valuePhaseForSection(
    section_key: string,
    lifecycle: DrawerSectionLifecycle,
    enrichment: DrawerEnrichmentState,
    deferred_keys: ReadonlySet<string>
): DrawerSectionValuePhase {
    if (enrichment.background_full_failed && deferred_keys.has(section_key)) {
        return "error";
    }
    if (lifecycle === "reserved_placeholder" && enrichment.full_pending) {
        return "skeleton";
    }
    if (lifecycle === "below_fold_deferred" && !enrichment.full_complete) {
        return "skeleton";
    }
    if (enrichment.primary_loaded || enrichment.full_complete) {
        return "value";
    }
    return "skeleton";
}

export function slotByKey(shell: DrawerShellContract): Map<string, DrawerSectionSlot> {
    return new Map(shell.section_slots.map((s) => [s.section_key, s]));
}

/**
 * Map shell sections to render models — structure stable; value phase updates on hydrate.
 */
export function buildSectionRenderModels(
    shell: DrawerShellContract,
    sections: EntityDrawerSectionConfig[],
    enrichment: DrawerEnrichmentState,
    deferred_section_keys: ReadonlySet<string>
): DrawerSectionRenderModel[] {
    const slots = slotByKey(shell);
    return sections.map((s) => {
        const slot = slots.get(s.key);
        const lifecycle = slot?.lifecycle ?? "immediate";
        return {
            section_key: s.key,
            lifecycle,
            default_expanded: s.defaultExpanded !== false,
            collapsible: s.collapsible !== false,
            value_phase: valuePhaseForSection(s.key, lifecycle, enrichment, deferred_section_keys),
            shell_min_height_class: slot?.shell_min_height_class,
        };
    });
}

/** Above-fold locked: keep deferred sections in DOM with collapsed/reserved chrome. */
export function stabilizeOverviewSectionsFromShell(
    shell: DrawerShellContract,
    sections: EntityDrawerSectionConfig[],
    enrichment: DrawerEnrichmentState,
    params: StabilizeSectionsParams
): EntityDrawerSectionConfig[] {
    if (params.above_fold_locked) {
        return sections.map((s) => {
            if (s.key === "inquiry_children") {
                return { ...s, defaultExpanded: true, collapsible: true };
            }
            if (params.deferred_section_keys.has(s.key)) {
                return { ...s, defaultExpanded: false, collapsible: true };
            }
            return s;
        });
    }
    if (params.filter_deferred_when_unlocked) {
        return params.filter_deferred_when_unlocked(
            sections,
            params.first_paint_gates_active === true,
            params.enrichment_layout_ready === true,
            params.enrichment_held
        );
    }
    return sections;
}
