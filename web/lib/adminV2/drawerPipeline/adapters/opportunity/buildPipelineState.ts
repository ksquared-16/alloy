import { assembleDrawerPipelineState } from "@/lib/adminV2/drawerPipeline/assemblePipelineState";
import { buildOpportunityAboveFoldRenderModel } from "@/lib/adminV2/drawerPipeline/adapters/opportunity/buildAboveFoldRenderModel";
import { OPPORTUNITY_PRIMARY_SHELL_ATTACHES } from "@/lib/adminV2/drawerPipeline/adapters/opportunity/deferredSections";
import type { DrawerPipelineState, DrawerShellContract } from "@/lib/adminV2/drawerPipeline/types";

export type BuildOpportunityDrawerPipelineInput = {
    shell: DrawerShellContract;
    record: Record<string, unknown>;
    drawer_id: string;
    background_full_failed: boolean;
    enrichment_held_until_interaction?: boolean;
    bootstrap_enrichment_path?: boolean;
    workflow_v1: boolean;
    above_fold_locked: boolean;
    first_paint_gates_active: boolean;
    enrichment_layout_ready: boolean;
    below_fold_enrichment_ready: boolean;
    task_assist_enabled: boolean;
    family_contacts_in_summary_fallback?: boolean;
};

export function buildOpportunityDrawerPipelineState(
    input: BuildOpportunityDrawerPipelineInput
): DrawerPipelineState {
    return assembleDrawerPipelineState({
        shell: input.shell,
        enrichment: {
            record: input.record,
            drawer_id: input.drawer_id,
            background_full_failed: input.background_full_failed,
            enrichment_held_until_interaction: input.enrichment_held_until_interaction,
        },
        hydration: {
            entity_type: "opportunity",
            bootstrap_path: input.bootstrap_enrichment_path === true,
            primary_shell_attaches: [...OPPORTUNITY_PRIMARY_SHELL_ATTACHES],
            hold_full_until_interaction: input.enrichment_held_until_interaction,
        },
        build_above_fold: (enrichment) =>
            buildOpportunityAboveFoldRenderModel({
                shell: input.shell,
                record: input.record,
                enrichment,
                workflow_v1: input.workflow_v1,
                above_fold_locked: input.above_fold_locked,
                first_paint_gates_active: input.first_paint_gates_active,
                enrichment_layout_ready: input.enrichment_layout_ready,
                enrichment_held: input.enrichment_held_until_interaction,
                below_fold_enrichment_ready: input.below_fold_enrichment_ready,
                task_assist_enabled: input.task_assist_enabled,
                family_contacts_in_summary_fallback: input.family_contacts_in_summary_fallback,
            }),
    });
}
