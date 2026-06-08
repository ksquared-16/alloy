import { adminV2DrawerViewModelShadowEnabled } from "@/lib/adminV2/viewModel/drawer/shadow/drawerViewModelShadowGate";
import type { OpportunityDrawerViewModelResult } from "@/lib/adminV2/viewModel/drawer/types";

/** Server/Vercel summary — compose outcome only; diff fields stay zero until client shadow diff. */
export type DrawerViewModelShadowServerSummary = {
    opportunity_id: string;
    generation: string | null;
    structureSettled: boolean;
    compose_ms: number | null;
    structural_mismatch_count: number;
    scalar_warning_count: number;
    mismatch_keys: string[];
    cutover_ready: boolean;
    skip_reason: string | null;
};

export function buildDrawerViewModelShadowServerComposeSummary(params: {
    opportunity_id: string;
    generation?: string | null;
    structureSettled: boolean;
    compose_ms?: number | null;
    skip_reason?: string | null;
}): DrawerViewModelShadowServerSummary {
    return {
        opportunity_id: params.opportunity_id,
        generation: params.generation ?? null,
        structureSettled: params.structureSettled,
        compose_ms: params.compose_ms ?? null,
        structural_mismatch_count: 0,
        scalar_warning_count: 0,
        mismatch_keys: [],
        cutover_ready: params.structureSettled,
        skip_reason: params.skip_reason ?? null,
    };
}

/** Never throws — shadow diagnostics must not affect compose or API responses. */
export function safeLogDrawerViewModelShadowServerSummary(summary: DrawerViewModelShadowServerSummary): void {
    if (!adminV2DrawerViewModelShadowEnabled()) return;
    try {
        console.info("[drawer-vm-shadow:summary]", summary);
    } catch {
        /* shadow logging is best-effort only */
    }
}

export function logOpportunityDrawerViewModelComposeShadowSummary(
    opportunityId: string,
    result: OpportunityDrawerViewModelResult,
    elapsedMs: number
): void {
    if (result.ok) {
        safeLogDrawerViewModelShadowServerSummary(
            buildDrawerViewModelShadowServerComposeSummary({
                opportunity_id: opportunityId,
                generation: result.viewModel.generation,
                structureSettled: result.viewModel.structureSettled,
                compose_ms: result.viewModel.timing.compose_ms,
                skip_reason: null,
            })
        );
        return;
    }

    safeLogDrawerViewModelShadowServerSummary(
        buildDrawerViewModelShadowServerComposeSummary({
            opportunity_id: opportunityId,
            structureSettled: result.skipped.structureSettled,
            compose_ms: elapsedMs,
            skip_reason: result.skipped.reason,
        })
    );
}

export function logOpportunityDrawerViewModelComposeFailureShadowSummary(
    opportunityId: string,
    elapsedMs: number
): void {
    safeLogDrawerViewModelShadowServerSummary(
        buildDrawerViewModelShadowServerComposeSummary({
            opportunity_id: opportunityId,
            structureSettled: false,
            compose_ms: elapsedMs,
            skip_reason: "compose_failed",
        })
    );
}
