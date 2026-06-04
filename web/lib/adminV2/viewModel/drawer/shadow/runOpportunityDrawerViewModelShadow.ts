import type { OpportunityDrawerOpenPreload } from "@/lib/admin/opportunityDrawerOpenCoordinator";
import type { OpportunityWorkspaceContext } from "@/contexts/AdminDrawerContext";
import { assembleLegacyDrawerOpenShadowSnapshot } from "@/lib/adminV2/viewModel/drawer/shadow/assembleLegacyDrawerOpenShadowSnapshot";
import { adminV2DrawerViewModelShadowEnabled } from "@/lib/adminV2/viewModel/drawer/shadow/drawerViewModelShadowGate";
import { diffOpportunityDrawerViewModelShadow } from "@/lib/adminV2/viewModel/drawer/shadow/diffOpportunityDrawerViewModelShadow";
import { extractOpportunityDrawerViewModelShadowSnapshot } from "@/lib/adminV2/viewModel/drawer/shadow/extractOpportunityDrawerViewModelShadowSnapshot";
import { fetchOpportunityDrawerViewModelClient } from "@/lib/adminV2/viewModel/drawer/shadow/fetchOpportunityDrawerViewModelClient";
import {
    safeLogDrawerViewModelShadow,
    type DrawerViewModelShadowLogPayload,
} from "@/lib/adminV2/viewModel/drawer/shadow/logDrawerViewModelShadow";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export type RunOpportunityDrawerViewModelShadowParams = {
    preload: OpportunityDrawerOpenPreload;
    workspaceContext: OpportunityWorkspaceContext | null | undefined;
    init?: RequestInit;
};

const EMPTY_DIFF: DrawerViewModelShadowLogPayload["diff"] = {
    structural_mismatches: [],
    structural_improvements: [],
    scalar_warnings: [],
    mismatch_count: 0,
};

function shadowFailurePayload(
    params: RunOpportunityDrawerViewModelShadowParams,
    partial: Partial<DrawerViewModelShadowLogPayload>
): DrawerViewModelShadowLogPayload {
    return {
        opportunity_id: params.preload.opportunityId,
        generation: null,
        compose_ms: null,
        fetch_ms: 0,
        diff_ms: 0,
        vm_structure_settled: false,
        legacy_path: "composed_open",
        diff: EMPTY_DIFF,
        skip_reason: null,
        ...partial,
    };
}

/** Non-blocking post-open shadow — never awaited by composed open. */
export function scheduleOpportunityDrawerViewModelShadow(
    params: RunOpportunityDrawerViewModelShadowParams
): void {
    if (!adminV2DrawerViewModelShadowEnabled()) return;
    void runOpportunityDrawerViewModelShadow(params);
}

export async function runOpportunityDrawerViewModelShadow(
    params: RunOpportunityDrawerViewModelShadowParams
): Promise<void> {
    if (!adminV2DrawerViewModelShadowEnabled()) return;

    try {
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
                safeLogDrawerViewModelShadow({
                    opportunity_id: params.preload.opportunityId,
                    generation: null,
                    compose_ms: null,
                    fetch_ms,
                    diff_ms: Math.round((typeof performance !== "undefined" ? performance.now() : 0) - diffStart),
                    vm_structure_settled: false,
                    legacy_path: "composed_open",
                    skip_reason: fetchResult.skipped.reason,
                    diff,
                });
                return;
            }
            safeLogDrawerViewModelShadow(
                shadowFailurePayload(params, {
                    fetch_ms,
                    error: "error" in fetchResult ? fetchResult.error : "drawer_vm_fetch_failed",
                })
            );
            return;
        }

        const vmSnapshot = extractOpportunityDrawerViewModelShadowSnapshot(fetchResult.viewModel);
        const diff = diffOpportunityDrawerViewModelShadow(legacy, vmSnapshot);
        const diff_ms = Math.round((typeof performance !== "undefined" ? performance.now() : 0) - diffStart);

        safeLogDrawerViewModelShadow({
            opportunity_id: params.preload.opportunityId,
            generation: fetchResult.viewModel.generation,
            compose_ms: fetchResult.viewModel.timing.compose_ms,
            fetch_ms,
            diff_ms,
            vm_structure_settled: true,
            legacy_path: "composed_open",
            skip_reason: null,
            diff,
        });
    } catch (error: unknown) {
        safeLogDrawerViewModelShadow(
            shadowFailurePayload(params, {
                error: error instanceof Error ? error.message : "drawer_vm_shadow_failed",
            })
        );
    }
}
