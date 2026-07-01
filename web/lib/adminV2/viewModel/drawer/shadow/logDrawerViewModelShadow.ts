import type { DrawerViewModelShadowDiffReport } from "@/lib/adminV2/viewModel/drawer/shadow/diffOpportunityDrawerViewModelShadow";
import { perfDebugTraceEnabled, perfDrawer } from "@/lib/perf/perfNamespaceLog";

export type DrawerViewModelShadowSummary = {
    opportunity_id: string;
    structureSettled: boolean;
    compose_ms: number | null;
    structural_mismatch_count: number;
    scalar_warning_count: number;
    mismatch_keys: string[];
    /** True when VM settled and no structural mismatches — candidate for render cutover. */
    cutover_ready: boolean;
};

export type DrawerViewModelShadowLogPayload = {
    opportunity_id: string;
    generation: string | null;
    compose_ms: number | null;
    fetch_ms: number;
    diff_ms: number;
    vm_structure_settled: boolean;
    legacy_path: "composed_open";
    diff: DrawerViewModelShadowDiffReport;
    skip_reason?: string | null;
    error?: string;
};

export function drawerViewModelShadowMismatchKeys(diff: DrawerViewModelShadowDiffReport): string[] {
    return diff.structural_mismatches.map((entry) => entry.field);
}

export function buildDrawerViewModelShadowSummary(
    payload: Pick<
        DrawerViewModelShadowLogPayload,
        "opportunity_id" | "compose_ms" | "vm_structure_settled" | "diff"
    >
): DrawerViewModelShadowSummary {
    const structural_mismatch_count = payload.diff.mismatch_count;
    const scalar_warning_count = payload.diff.scalar_warnings.length;
    const mismatch_keys = drawerViewModelShadowMismatchKeys(payload.diff);
    return {
        opportunity_id: payload.opportunity_id,
        structureSettled: payload.vm_structure_settled,
        compose_ms: payload.compose_ms,
        structural_mismatch_count,
        scalar_warning_count,
        mismatch_keys,
        cutover_ready: payload.vm_structure_settled && structural_mismatch_count === 0,
    };
}

/** Never throws — shadow diagnostics must not affect drawer UX. */
export function safeLogDrawerViewModelShadow(payload: DrawerViewModelShadowLogPayload): void {
    try {
        logDrawerViewModelShadow(payload);
    } catch {
        /* shadow logging is best-effort only */
    }
}

export function logDrawerViewModelShadow(payload: DrawerViewModelShadowLogPayload): void {
    if (typeof window === "undefined") return;
    if (!perfDebugTraceEnabled()) return;

    const summary = buildDrawerViewModelShadowSummary(payload);
    perfDrawer("vm_shadow_summary", {
        entity_type: "opportunity",
        entity_id: summary.opportunity_id,
        compose_ms: summary.compose_ms ?? undefined,
        count: summary.structural_mismatch_count,
        duration_ms: payload.fetch_ms,
        source: "shadow",
    });
}
