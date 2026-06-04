import { parseInquirySummaryTaskPreview } from "@/lib/admin/drawer/opportunityInquirySummaryTaskPreview";
import { opportunityInquirySummaryRightPanelFromPrimaryOnly } from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";
import { buildOpportunityAboveFoldRenderModel } from "@/lib/adminV2/drawerPipeline/adapters/opportunity/buildAboveFoldRenderModel";
import { opportunityShellToDrawerShellContract } from "@/lib/adminV2/drawerPipeline/adapters/opportunity/compileShell";
import { readOpportunityDrawerGeometry } from "@/lib/adminV2/drawerPipeline/adapters/opportunity/geometry";
import type {
    DrawerAboveFoldRenderModel,
    DrawerEnrichmentState,
    DrawerInquirySummaryRightColumnRenderModel,
    DrawerShellContract,
} from "@/lib/adminV2/drawerPipeline/types";
import { compileOpportunityRecordDrawerShellFromEntity } from "@/lib/adminV2/shellContracts/compileOpportunityRecordDrawerShell";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";
import type { RemindersSummaryVm } from "@/lib/adminV2/viewModel/drawer/types";

export function settledDrawerEnrichmentState(record: Record<string, unknown>): DrawerEnrichmentState {
    return {
        record_surface: "full",
        primary_loaded: true,
        full_pending: false,
        full_complete: true,
        background_full_failed: false,
        enrichment_held_until_interaction: false,
    };
}

export function compileOpportunityDrawerViewModelShell(params: {
    layoutConfig: RecordLayoutConfigJson | null;
    record: Record<string, unknown>;
}): DrawerShellContract | null {
    const oppShell = compileOpportunityRecordDrawerShellFromEntity(params.layoutConfig, params.record);
    return oppShell ? opportunityShellToDrawerShellContract(oppShell) : null;
}

export function buildOpportunityDrawerViewModelRightColumn(params: {
    record: Record<string, unknown>;
    reminders: RemindersSummaryVm;
    task_assist_enabled: boolean;
}): DrawerInquirySummaryRightColumnRenderModel {
    if (!params.task_assist_enabled) {
        return {
            tasks: { visible: false, state: "hidden", open_count: 0, open_tasks: [] },
            reminders: { visible: false, state: "hidden", next_follow_up_iso: null },
            orchestrator_handoff: { visible: false, state: "hidden" },
        };
    }

    const taskPreview = parseInquirySummaryTaskPreview(params.record);
    const tasksState =
        taskPreview && taskPreview.open_count > 0 ? "ready"
        : taskPreview ? "empty"
        : "empty";

    return {
        tasks: {
            visible: true,
            state: tasksState,
            open_count: taskPreview?.open_count ?? 0,
            open_tasks: taskPreview?.open_tasks ?? [],
        },
        reminders: {
            visible: true,
            state: params.reminders.state,
            next_follow_up_iso: params.reminders.next_follow_up_iso,
        },
        orchestrator_handoff: {
            visible: false,
            state: "hidden",
        },
    };
}

export function buildOpportunityDrawerViewModelAboveFold(params: {
    shell: DrawerShellContract;
    record: Record<string, unknown>;
    reminders: RemindersSummaryVm;
    task_assist_enabled: boolean;
}): DrawerAboveFoldRenderModel {
    const enrichment = settledDrawerEnrichmentState(params.record);
    const geometry = readOpportunityDrawerGeometry(params.shell);
    const show_right_column =
        geometry.summary_right_column_reserved ||
        opportunityInquirySummaryRightPanelFromPrimaryOnly(params.record) ||
        params.task_assist_enabled;

    const base = buildOpportunityAboveFoldRenderModel({
        shell: params.shell,
        record: params.record,
        enrichment,
        workflow_v1: true,
        above_fold_locked: true,
        first_paint_gates_active: false,
        enrichment_layout_ready: true,
        below_fold_enrichment_ready: true,
        task_assist_enabled: params.task_assist_enabled,
        family_contacts_in_summary_fallback: geometry.family_contacts_in_summary,
    });

    const right_column = buildOpportunityDrawerViewModelRightColumn({
        record: params.record,
        reminders: params.reminders,
        task_assist_enabled: params.task_assist_enabled,
    });

    if (!base.inquiry_summary) {
        return base;
    }

    return {
        ...base,
        inquiry_summary: {
            ...base.inquiry_summary,
            column_mode: show_right_column ? "two" : "one",
            show_right_column,
            right_column,
            task_preview: {
                confirmed: right_column.tasks.state === "ready" || right_column.tasks.state === "empty",
                open_count: right_column.tasks.open_count,
                open_tasks: right_column.tasks.open_tasks,
                show_reminders_placeholder: false,
                show_operational_strip: false,
            },
        },
    };
}
