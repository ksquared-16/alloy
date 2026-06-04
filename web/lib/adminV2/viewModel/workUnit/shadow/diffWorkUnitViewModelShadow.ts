import type { LiveWorkUnitShadowSnapshot } from "@/lib/adminV2/viewModel/workUnit/shadow/assembleLiveWorkUnitShadowSnapshot";

export type WorkUnitViewModelShadowDiff = {
    mismatches: string[];
    mismatch_count: number;
};

const COMPARE_KEYS: (keyof LiveWorkUnitShadowSnapshot)[] = [
    "work_unit_id",
    "department_id",
    "first_paint_settled",
    "header_pill_count",
    "selected_queue_key",
    "queue_row_count",
    "queue_rows_loading",
    "lane_reveal_state",
    "kpi_metric_count",
    "kpi_metrics_pending",
    "actions_rail_state",
    "queue_lane_state",
];

export function diffWorkUnitViewModelShadow(
    live: LiveWorkUnitShadowSnapshot,
    vm: LiveWorkUnitShadowSnapshot
): WorkUnitViewModelShadowDiff {
    const mismatches: string[] = [];
    for (const key of COMPARE_KEYS) {
        if (live[key] !== vm[key]) {
            mismatches.push(`${key}: live=${String(live[key])} vm=${String(vm[key])}`);
        }
    }
    return { mismatches, mismatch_count: mismatches.length };
}
