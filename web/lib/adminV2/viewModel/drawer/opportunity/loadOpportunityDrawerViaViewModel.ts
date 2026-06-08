import type { OpportunityWorkspaceContext } from "@/contexts/AdminDrawerContext";
import type { OpportunityDrawerOpenPreload } from "@/lib/admin/opportunityDrawerOpenCoordinator";
import { opportunityDrawerComposedRevealReady } from "@/lib/admin/opportunityDrawerOpenCoordinator";
import { adminV2DrawerViewModelCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/drawerViewModelCutoverGate";
import { buildOpportunityDrawerOpenPreloadFromViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerOpenPreloadFromViewModel";
import { opportunityDrawerViewModelStructureSettled } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelContract";
import { fetchOpportunityDrawerViewModelClient } from "@/lib/adminV2/viewModel/drawer/shadow/fetchOpportunityDrawerViewModelClient";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export type LoadOpportunityDrawerViaViewModelResult =
    | { ok: true; preload: OpportunityDrawerOpenPreload; compose_ms: number }
    | {
          ok: false;
          reason: "cutover_disabled" | "fetch_failed" | "skipped" | "not_structure_settled" | "composed_not_ready";
          skip_reason?: string;
      };

export async function loadOpportunityDrawerViaViewModel(
    opportunityId: string,
    workspaceContext: OpportunityWorkspaceContext | null | undefined,
    init?: RequestInit
): Promise<LoadOpportunityDrawerViaViewModelResult> {
    if (!adminV2DrawerViewModelCutoverEnabled()) {
        return { ok: false, reason: "cutover_disabled" };
    }

    const fetchResult = await fetchOpportunityDrawerViewModelClient(
        opportunityId,
        workspaceContext,
        init ?? workspaceDataFetchInit()
    );

    if (!fetchResult.ok) {
        if ("skipped" in fetchResult && fetchResult.skipped) {
            return { ok: false, reason: "skipped", skip_reason: fetchResult.skipped.reason };
        }
        return { ok: false, reason: "fetch_failed" };
    }

    const { viewModel } = fetchResult;
    if (!viewModel.structureSettled || !opportunityDrawerViewModelStructureSettled(viewModel)) {
        return { ok: false, reason: "not_structure_settled" };
    }

    const preload = buildOpportunityDrawerOpenPreloadFromViewModel(viewModel);
    if (!opportunityDrawerComposedRevealReady(preload)) {
        return { ok: false, reason: "composed_not_ready" };
    }

    return { ok: true, preload, compose_ms: viewModel.timing.compose_ms };
}
