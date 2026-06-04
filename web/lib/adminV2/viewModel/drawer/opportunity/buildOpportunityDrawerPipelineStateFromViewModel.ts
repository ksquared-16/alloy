import { buildDrawerHydrationPlan } from "@/lib/adminV2/drawerPipeline/hydrationPlan";
import type { DrawerPipelineState } from "@/lib/adminV2/drawerPipeline/types";
import { settledDrawerEnrichmentState } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerViewModelAboveFold";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";

/** Pin above-fold structure from settled VM — no client-side structural recompute. */
export function buildOpportunityDrawerPipelineStateFromViewModel(
    viewModel: OpportunityDrawerViewModel
): DrawerPipelineState {
    const enrichment = settledDrawerEnrichmentState(viewModel.above_fold.record);
    return {
        shell: viewModel.layout.shell,
        enrichment,
        hydration_plan: buildDrawerHydrationPlan({
            entity_type: "opportunity",
            bootstrap_path: false,
            primary_shell_attaches: [],
            hold_full_until_interaction: false,
        }),
        above_fold: viewModel.above_fold.render_model,
    };
}
