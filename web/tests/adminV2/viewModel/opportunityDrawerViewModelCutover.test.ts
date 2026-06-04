import { describe, expect, it } from "vitest";

import { buildOpportunityDrawerOpenPreloadFromViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerOpenPreloadFromViewModel";
import { buildOpportunityDrawerPipelineStateFromViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerPipelineStateFromViewModel";
import { aboveFoldSectionsStructureSettled } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelContract";
import { minimalSettledOpportunityDrawerViewModel } from "./fixtures/minimalSettledOpportunityDrawerViewModel";

describe("buildOpportunityDrawerOpenPreloadFromViewModel", () => {
    it("maps settled VM to composed-open preload with header actions and full paint surface", () => {
        const vm = minimalSettledOpportunityDrawerViewModel();
        const preload = buildOpportunityDrawerOpenPreloadFromViewModel(vm);

        expect(preload.openPath).toBe("view_model");
        expect(preload.opportunityId).toBe("opp-1");
        expect(preload.headerActions.header).toHaveLength(1);
        expect(preload.headerActions.header?.[0]?.key).toBe("schedule_tour");
        expect(preload.primaryEntity._record_surface).toBe("full");
        expect(preload.primaryEntity._inquiry_summary_tasks).toEqual(vm.summaries.tasks);
        expect(preload.bootstrap.record_layout?.inquiry_drawer_mode).toBe("workflow_v1");
        expect(preload.bootstrap.work_unit?.queue_definition).toBe(vm.workspace.queue_definition);
        expect(preload.enrichmentHeldUntilInteraction).toBe(false);
        expect(vm.first_paint.settled).toBe(true);
    });
});

describe("buildOpportunityDrawerPipelineStateFromViewModel", () => {
    it("pins settled above-fold with no skeleton/pending section phases", () => {
        const vm = minimalSettledOpportunityDrawerViewModel();
        const pipeline = buildOpportunityDrawerPipelineStateFromViewModel(vm);

        expect(aboveFoldSectionsStructureSettled(pipeline.above_fold.sections)).toBe(true);
        expect(pipeline.above_fold.inquiry_summary?.right_column?.tasks.state).toBe("ready");
        expect(pipeline.above_fold.inquiry_summary?.right_column?.reminders.state).toBe("empty");
        expect(pipeline.enrichment.full_complete).toBe(true);
        expect(pipeline.enrichment.full_pending).toBe(false);
    });
});
