import type { OpportunityDrawerOpenPreload } from "@/lib/admin/opportunityDrawerOpenCoordinator";
import type { OpportunityWorkspaceContext } from "@/contexts/AdminDrawerContext";
import { assembleLegacyDrawerOpenShadowSnapshot } from "@/lib/adminV2/viewModel/drawer/shadow/assembleLegacyDrawerOpenShadowSnapshot";
import { adminV2DrawerViewModelShadowEnabled } from "@/lib/adminV2/viewModel/drawer/shadow/drawerViewModelShadowGate";
import { diffOpportunityDrawerViewModelShadow } from "@/lib/adminV2/viewModel/drawer/shadow/diffOpportunityDrawerViewModelShadow";
import { extractOpportunityDrawerViewModelShadowSnapshot } from "@/lib/adminV2/viewModel/drawer/shadow/extractOpportunityDrawerViewModelShadowSnapshot";
import { fetchOpportunityDrawerViewModelClient } from "@/lib/adminV2/viewModel/drawer/shadow/fetchOpportunityDrawerViewModelClient";
import { logDrawerViewModelShadow } from "@/lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelShadow";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export type RunOpportunityDrawerViewModelShadowParams = {
    preload: OpportunityDrawerOpenPreload;
    workspaceContext: OpportunityWorkspaceContext | null | undefined;
    init?: RequestInit;
};

/** Non-blocking post-open shadow — never awaited by composed open. */
export function scheduleOpportunityDrawerViewModelShadow(
    params: RunOpportunityDrawerViewModelShadowParams
): void {
    if (!adminV2DrawerViewModelShadowEnabled()) return;
    void runOpportunityDrawerViewModelShadow(params).catch((error: unknown) => {
        logDrawerViewModelShadow({
            opportunity_id: params.preload.opportunityId,
            generation: null,
            compose_ms: null,
            fetch_ms: 0,
            diff_ms: 0,
            vm_structure_settled: false,
            legacy_path: "composed_open",
            diff: {
                structural_mismatches: [],
                structural_improvements: [],
                scalar_warnings: [],
                mismatch_count: 0,
            },
            error: error instanceof Error ? error.message : "drawer_vm_shadow_failed",
        });
    });
}

export async function runOpportunityDrawerViewModelShadow(
    params: RunOpportunityDrawerViewModelShadowParams
): Promise<void> {
    if (!adminV2DrawerViewModelShadowEnabled()) return;

    const fetchStart = typeof performance !== "undefined" ? performance.now() : 0;
    const legacy = assembleLegacyDrawerOpenShadowSnapshot(params.preload);
    const fetchResult = await fetchOpportunityDrawerViewModelClient(
        params.preload.opportunityId,
        params.workspaceContext,
        params.init ?? workspaceDataFetchInit()
    );
    const fetch_ms = Math.round((typeof performance !== "undefined" ? performance.now() : 0) - fetchStart);

    const diffStart = typeof performance !== "undefined" ? performance.now() : 0;

    if (!fetchResult.ok) {
        if ("skipped" in fetchResult && fetchResult.skipped) {
            const vmSnapshot = extractOpportunityDrawerViewModelShadowSnapshot(fetchResult.skipped);
            const diff = diffOpportunityDrawerViewModelShadow(legacy, vmSnapshot);
            logDrawerViewModelShadow({
                opportunity_id: params.preload.opportunityId,
                generation: null,
                compose_ms: null,
                fetch_ms,
                diff_ms: Math.round((typeof performance !== "undefined" ? performance.now() : 0) - diffStart),
                vm_structure_settled: false,
                legacy_path: "composed_open",
                diff,
            });
            return;
        }
        logDrawerViewModelShadow({
            opportunity_id: params.preload.opportunityId,
            generation: null,
            compose_ms: null,
            fetch_ms,
            diff_ms: 0,
            vm_structure_settled: false,
            legacy_path: "composed_open",
            diff: {
                structural_mismatches: [],
                structural_improvements: [],
                scalar_warnings: [],
                mismatch_count: 0,
            },
            error: "error" in fetchResult ? fetchResult.error : "drawer_vm_fetch_failed",
        });
        return;
    }

    const vmSnapshot = extractOpportunityDrawerViewModelShadowSnapshot(fetchResult.viewModel);
    const diff = diffOpportunityDrawerViewModelShadow(legacy, vmSnapshot);
    const diff_ms = Math.round((typeof performance !== "undefined" ? performance.now() : 0) - diffStart);

    logDrawerViewModelShadow({
        opportunity_id: params.preload.opportunityId,
        generation: fetchResult.viewModel.generation,
        compose_ms: fetchResult.viewModel.timing.compose_ms,
        fetch_ms,
        diff_ms,
        vm_structure_settled: true,
        legacy_path: "composed_open",
        diff,
    });
}
