import { buildDrawerEnrichmentState, type BuildDrawerEnrichmentStateInput } from "@/lib/adminV2/drawerPipeline/enrichmentState";
import { buildDrawerHydrationPlan, type BuildDrawerHydrationPlanInput } from "@/lib/adminV2/drawerPipeline/hydrationPlan";
import type { DrawerAboveFoldRenderModel, DrawerEnrichmentState, DrawerPipelineState, DrawerShellContract } from "@/lib/adminV2/drawerPipeline/types";

export type AssembleDrawerPipelineInput = {
    shell: DrawerShellContract;
    enrichment: BuildDrawerEnrichmentStateInput;
    hydration: BuildDrawerHydrationPlanInput;
    build_above_fold: (enrichment: DrawerEnrichmentState) => DrawerAboveFoldRenderModel;
};

export function assembleDrawerPipelineState(input: AssembleDrawerPipelineInput): DrawerPipelineState {
    const enrichment = buildDrawerEnrichmentState(input.enrichment);
    const hydration_plan = buildDrawerHydrationPlan(input.hydration);
    const above_fold = input.build_above_fold(enrichment);
    return {
        shell: input.shell,
        enrichment,
        hydration_plan,
        above_fold,
    };
}
