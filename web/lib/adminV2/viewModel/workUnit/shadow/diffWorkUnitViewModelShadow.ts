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
    "row_action_count",
    "right_rail_action_count",
    "action_availability_state",
    "row_action_keys",
    "right_rail_action_keys",
];

function diffActionKeySets(liveKeys: string, vmKeys: string): string[] {
    const live = new Set(liveKeys ? liveKeys.split(",") : []);
    const vmSet = new Set(vmKeys ? vmKeys.split(",") : []);
    const missing: string[] = [];
    const extra: string[] = [];
    for (const key of live) {
        if (key && !vmSet.has(key)) missing.push(key);
    }
    for (const key of vmSet) {
        if (key && !live.has(key)) extra.push(key);
    }
    const out: string[] = [];
    if (missing.length) out.push(`missing_action_ids: ${missing.join(",")}`);
    if (extra.length) out.push(`extra_action_ids: ${extra.join(",")}`);
    return out;
}

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
    mismatches.push(...diffActionKeySets(live.row_action_keys, vm.row_action_keys));
    mismatches.push(
        ...diffActionKeySets(live.right_rail_action_keys, vm.right_rail_action_keys).map((m) =>
            m.replace("missing_action_ids", "missing_right_rail_action_ids").replace("extra_action_ids", "extra_right_rail_action_ids")
        )
    );
    return { mismatches, mismatch_count: mismatches.length };
}
