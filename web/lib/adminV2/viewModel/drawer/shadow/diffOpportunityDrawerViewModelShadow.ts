import type { LegacyDrawerOpenShadowSnapshot } from "@/lib/adminV2/viewModel/drawer/shadow/assembleLegacyDrawerOpenShadowSnapshot";
import type { ViewModelDrawerOpenShadowSnapshot } from "@/lib/adminV2/viewModel/drawer/shadow/extractOpportunityDrawerViewModelShadowSnapshot";

export type DrawerViewModelShadowDiffEntry = {
    field: string;
    kind: "structural_mismatch" | "structural_improvement" | "scalar_warning";
    legacy: unknown;
    vm: unknown;
};

export type DrawerViewModelShadowDiffReport = {
    structural_mismatches: DrawerViewModelShadowDiffEntry[];
    structural_improvements: DrawerViewModelShadowDiffEntry[];
    scalar_warnings: DrawerViewModelShadowDiffEntry[];
    mismatch_count: number;
};

function keysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
}

export function diffOpportunityDrawerViewModelShadow(
    legacy: LegacyDrawerOpenShadowSnapshot,
    vm: ViewModelDrawerOpenShadowSnapshot
): DrawerViewModelShadowDiffReport {
    const structural_mismatches: DrawerViewModelShadowDiffEntry[] = [];
    const structural_improvements: DrawerViewModelShadowDiffEntry[] = [];
    const scalar_warnings: DrawerViewModelShadowDiffEntry[] = [];

    if (!vm.structure_settled) {
        if (legacy.layout_mode === "workflow_v1") {
            structural_mismatches.push({
                field: "structure_settled",
                kind: "structural_mismatch",
                legacy: legacy.layout_mode,
                vm: vm.skip_reason,
            });
        }
        return finalize(structural_mismatches, structural_improvements, scalar_warnings);
    }

    if (legacy.layout_mode !== "unknown" && vm.layout_mode !== legacy.layout_mode) {
        structural_mismatches.push({
            field: "layout_mode",
            kind: "structural_mismatch",
            legacy: legacy.layout_mode,
            vm: vm.layout_mode,
        });
    }

    if (!keysEqual(legacy.header_action_keys, vm.header_action_keys)) {
        structural_mismatches.push({
            field: "header_action_keys",
            kind: "structural_mismatch",
            legacy: legacy.header_action_keys,
            vm: vm.header_action_keys,
        });
    }

    if (legacy.status_key && vm.status_key && legacy.status_key !== vm.status_key) {
        structural_mismatches.push({
            field: "status_key",
            kind: "structural_mismatch",
            legacy: legacy.status_key,
            vm: vm.status_key,
        });
    }

    if (legacy.tasks_open_count !== (vm.tasks_open_count ?? 0)) {
        structural_mismatches.push({
            field: "tasks_open_count",
            kind: "structural_mismatch",
            legacy: legacy.tasks_open_count,
            vm: vm.tasks_open_count,
        });
    }

    if (vm.above_fold_forbidden_phases.length > 0) {
        structural_mismatches.push({
            field: "above_fold_value_phases",
            kind: "structural_mismatch",
            legacy: "settled_expected",
            vm: vm.above_fold_forbidden_phases,
        });
    }

    if (vm.reminders_state === "ready" || vm.reminders_state === "empty") {
        structural_improvements.push({
            field: "reminders_slot_settled",
            kind: "structural_improvement",
            legacy: legacy.reminders_next_follow_up_iso ?? "client_fetch_pending",
            vm: vm.reminders_state,
        });
    }

    if (
        vm.tasks_state === "ready" ||
        vm.tasks_state === "empty"
    ) {
        structural_improvements.push({
            field: "tasks_slot_settled",
            kind: "structural_improvement",
            legacy: legacy.tasks_open_count,
            vm: vm.tasks_state,
        });
    }

    if (legacy.status_display && vm.status_render_as === "readonly_pill") {
        scalar_warnings.push({
            field: "status_control_type",
            kind: "scalar_warning",
            legacy: "text_or_pending_chrome",
            vm: vm.status_render_as,
        });
    }

    return finalize(structural_mismatches, structural_improvements, scalar_warnings);
}

function finalize(
    structural_mismatches: DrawerViewModelShadowDiffEntry[],
    structural_improvements: DrawerViewModelShadowDiffEntry[],
    scalar_warnings: DrawerViewModelShadowDiffEntry[]
): DrawerViewModelShadowDiffReport {
    return {
        structural_mismatches,
        structural_improvements,
        scalar_warnings,
        mismatch_count: structural_mismatches.length,
    };
}
