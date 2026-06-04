import type { DrawerViewModelShadowDiffReport } from "@/lib/adminV2/viewModel/drawer/shadow/diffOpportunityDrawerViewModelShadow";

export type DrawerViewModelShadowLogPayload = {
    opportunity_id: string;
    generation: string | null;
    compose_ms: number | null;
    fetch_ms: number;
    diff_ms: number;
    vm_structure_settled: boolean;
    legacy_path: "composed_open";
    diff: DrawerViewModelShadowDiffReport;
    error?: string;
};

export function logDrawerViewModelShadow(payload: DrawerViewModelShadowLogPayload): void {
    if (typeof window === "undefined") return;
    console.info("[drawer-vm-shadow]", {
        opportunity_id: payload.opportunity_id,
        generation: payload.generation,
        compose_ms: payload.compose_ms,
        fetch_ms: payload.fetch_ms,
        diff_ms: payload.diff_ms,
        vm_structure_settled: payload.vm_structure_settled,
        structural_mismatch_count: payload.diff.mismatch_count,
        structural_mismatches: payload.diff.structural_mismatches,
        structural_improvements: payload.diff.structural_improvements,
        scalar_warnings: payload.diff.scalar_warnings,
        legacy_path: payload.legacy_path,
        ...(payload.error ? { error: payload.error } : {}),
    });
}
