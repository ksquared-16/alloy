import { rightColumnStructureKeys } from "@/lib/adminV2/drawerPipeline/adapters/opportunity/buildInquirySummaryRightColumn";
import type {
    OpportunityDrawerViewModel,
    OpportunityDrawerViewModelSkipped,
} from "@/lib/adminV2/viewModel/drawer/types";

export type ViewModelDrawerOpenShadowSnapshot = {
    structure_settled: boolean;
    skip_reason: string | null;
    layout_mode: "workflow_v1" | "classic" | "unknown" | null;
    header_action_keys: string[];
    status_render_as: string | null;
    status_key: string | null;
    above_fold_section_keys: string[];
    above_fold_forbidden_phases: string[];
    tasks_state: string | null;
    tasks_open_count: number | null;
    reminders_state: string | null;
    right_column_structure_keys: string[];
};

export function extractOpportunityDrawerViewModelShadowSnapshot(
    payload: OpportunityDrawerViewModel | OpportunityDrawerViewModelSkipped
): ViewModelDrawerOpenShadowSnapshot {
    if (!("structureSettled" in payload) || payload.structureSettled !== true) {
        const skipped = payload as OpportunityDrawerViewModelSkipped;
        return {
            structure_settled: false,
            skip_reason: skipped.reason,
            layout_mode: null,
            header_action_keys: [],
            status_render_as: null,
            status_key: null,
            above_fold_section_keys: [],
            above_fold_forbidden_phases: [],
            tasks_state: null,
            tasks_open_count: null,
            reminders_state: null,
            right_column_structure_keys: [],
        };
    }

    const vm = payload as OpportunityDrawerViewModel;
    const forbidden = new Set(["skeleton", "pending"]);
    const above_fold_forbidden_phases: string[] = [];
    const above_fold_section_keys: string[] = [];

    for (const section of vm.above_fold.render_model.sections) {
        if (section.lifecycle === "hidden" || section.lifecycle === "below_fold_deferred") continue;
        above_fold_section_keys.push(section.section_key);
        if (forbidden.has(section.value_phase)) {
            above_fold_forbidden_phases.push(`${section.section_key}:${section.value_phase}`);
        }
    }

    const rightColumn = vm.above_fold.render_model.inquiry_summary?.right_column ?? null;
    const status = vm.header.status;

    return {
        structure_settled: true,
        skip_reason: null,
        layout_mode: vm.layout.mode,
        header_action_keys: vm.actions.header.map((a) => a.key).filter(Boolean).sort(),
        status_render_as: status.renderAs,
        status_key: status.renderAs === "dropdown" ? status.status_key : null,
        above_fold_section_keys: above_fold_section_keys.sort(),
        above_fold_forbidden_phases,
        tasks_state: rightColumn?.tasks.state ?? null,
        tasks_open_count: vm.summaries.tasks.open_count,
        reminders_state: vm.summaries.reminders.state,
        right_column_structure_keys: rightColumn ? rightColumnStructureKeys(rightColumn).sort() : [],
    };
}
