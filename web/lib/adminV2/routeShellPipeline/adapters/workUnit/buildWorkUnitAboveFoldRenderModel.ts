import { isEnrollmentLikeDepartmentKey } from "@/lib/workspace/enrollmentDepartmentKey";
import { mergeEnrollmentRightRailActions } from "@/lib/workspace/viewModels/enrollmentRightRailMerge";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { ActionsVm } from "@/lib/ui-v2/workspace-types";
import { ADMINV2_WORK_UNIT_QUEUE_ROW_SKELETON_COUNT } from "@/lib/ui-v2/adminV2LoadingGeometry";
import { workUnitQueuePillKeySelected } from "@/lib/adminV2/workUnitQueueSelection";
import {
    WORK_UNIT_ATTENTION_BUCKET_PILL_PREFIX,
    type WorkUnitAboveFoldChip,
    type WorkUnitAboveFoldChipSection,
    type WorkUnitAboveFoldRenderModel,
    type WorkUnitAboveFoldSlotState,
} from "@/lib/adminV2/routeShellPipeline/adapters/workUnit/aboveFoldTypes";

export type WorkUnitQueueSummaryInput = {
    key: string;
    label: string;
    description?: string;
    priority: "standard" | "attention" | "critical";
    count: number;
    counts_deferred?: boolean;
};

export type WorkUnitChipPlaceholderQueue = {
    key: string;
    label: string;
    priority: "standard" | "attention" | "critical";
};

export type WorkUnitChipPlaceholderSection = {
    key: string;
    label: string;
    queues: WorkUnitChipPlaceholderQueue[];
};

export type BuildWorkUnitAboveFoldRenderModelInput = {
    work_unit_shell_ready: boolean;
    department_key?: string | null;
    reserve_actions_rail: boolean;
    queue_summaries: WorkUnitQueueSummaryInput[] | null;
    queue_summaries_error: string | null;
    queue_pill_sections: WorkUnitChipPlaceholderSection[] | null;
    queue_tab_placeholders: WorkUnitChipPlaceholderSection[] | null;
    selected_queue_key: string | null;
    attention_bucket_key: string;
    lane_unmapped_only: boolean;
    all_records_queue_key: string | null;
    other_pill_section_key: string | null;
    unmapped_pill_count: number | null;
    enrollment_right_rail_resolved: ResolvedActionForClient[] | null;
    queue_items_loading: boolean;
    queue_items_ready: boolean;
    queue_items_error: string | null;
    authoritative_badge_for_selected_tab?: number;
    reconcile_picker_count_zero?: boolean;
};

const EMPTY_ACTIONS: ActionsVm = {
    primaries: [],
    systemActions: [],
    quickOperations: [],
    overflow: [],
};

function chipSelected(qKey: string, input: BuildWorkUnitAboveFoldRenderModelInput): boolean {
    if (
        qKey.startsWith(WORK_UNIT_ATTENTION_BUCKET_PILL_PREFIX) ||
        input.selected_queue_key?.startsWith(WORK_UNIT_ATTENTION_BUCKET_PILL_PREFIX) ||
        input.selected_queue_key?.toLowerCase() === "needs_attention"
    ) {
        return workUnitQueuePillKeySelected(
            input.selected_queue_key,
            qKey,
            input.attention_bucket_key
        );
    }
    return (
        qKey === input.selected_queue_key &&
        (!input.lane_unmapped_only ||
            input.all_records_queue_key == null ||
            qKey !== input.all_records_queue_key)
    );
}

function chipCount(
    q: WorkUnitQueueSummaryInput,
    input: BuildWorkUnitAboveFoldRenderModelInput
): WorkUnitAboveFoldChip["count"] {
    const selected = chipSelected(q.key, input);
    if (
        selected &&
        typeof input.authoritative_badge_for_selected_tab === "number" &&
        !(input.lane_unmapped_only && input.all_records_queue_key != null && input.selected_queue_key === input.all_records_queue_key)
    ) {
        return input.authoritative_badge_for_selected_tab;
    }
    if (selected && input.reconcile_picker_count_zero) return 0;
    if (q.counts_deferred) return "skeleton";
    const raw = q.count;
    return typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : "emdash";
}

function buildChipFromSummary(q: WorkUnitQueueSummaryInput, input: BuildWorkUnitAboveFoldRenderModelInput): WorkUnitAboveFoldChip {
    const synth = q.key.startsWith(WORK_UNIT_ATTENTION_BUCKET_PILL_PREFIX);
    return {
        key: q.key,
        label: q.label,
        priority: q.priority,
        selected: chipSelected(q.key, input),
        count: chipCount(q, input),
        counts_deferred: q.counts_deferred,
        synthetic_attention_bucket: synth,
        attention_bucket_raw_key: synth
            ? q.key.slice(WORK_UNIT_ATTENTION_BUCKET_PILL_PREFIX.length) === "__all__"
                ? null
                : q.key.slice(WORK_UNIT_ATTENTION_BUCKET_PILL_PREFIX.length)
            : undefined,
        description: q.description,
    };
}

function buildChipFromPlaceholder(q: WorkUnitChipPlaceholderQueue, input: BuildWorkUnitAboveFoldRenderModelInput): WorkUnitAboveFoldChip {
    const synth = q.key.startsWith(WORK_UNIT_ATTENTION_BUCKET_PILL_PREFIX);
    return {
        key: q.key,
        label: q.label,
        priority: q.priority,
        selected: chipSelected(q.key, input),
        count: "skeleton",
        synthetic_attention_bucket: synth,
        attention_bucket_raw_key: synth
            ? q.key.slice(WORK_UNIT_ATTENTION_BUCKET_PILL_PREFIX.length) === "__all__"
                ? null
                : q.key.slice(WORK_UNIT_ATTENTION_BUCKET_PILL_PREFIX.length)
            : undefined,
    };
}

function buildHeaderSections(input: BuildWorkUnitAboveFoldRenderModelInput): WorkUnitAboveFoldChipSection[] {
    const summaries = input.queue_summaries;
    if (summaries && summaries.length > 0) {
        const sections =
            input.queue_pill_sections ??
            [{ key: "all", label: "Queues", queues: summaries }];
        return sections.map((sec) => ({
            key: sec.key,
            label: sec.label,
            chips: sec.queues.map((q) => buildChipFromSummary(q as WorkUnitQueueSummaryInput, input)),
        }));
    }
    const placeholders = input.queue_tab_placeholders;
    if (placeholders?.length) {
        return placeholders.map((sec) => ({
            key: sec.key,
            label: sec.label,
            chips: sec.queues.map((q) => buildChipFromPlaceholder(q, input)),
        }));
    }
    return [
        {
            key: "shell",
            label: "Queues",
            chips: [
                { key: "shell-1", label: "Queue", priority: "standard", selected: true, count: "skeleton" },
                { key: "shell-2", label: "Queue", priority: "standard", selected: false, count: "skeleton" },
                { key: "shell-3", label: "Queue", priority: "standard", selected: false, count: "skeleton" },
            ],
        },
    ];
}

function resolveHeaderState(input: BuildWorkUnitAboveFoldRenderModelInput): WorkUnitAboveFoldSlotState {
    if (!input.work_unit_shell_ready) return "skeleton";
    if (input.queue_summaries && input.queue_summaries.length > 0) return "ready";
    if (input.queue_summaries_error) return "ready";
    if (input.queue_tab_placeholders?.length) return "skeleton";
    return "skeleton";
}

function resolveActionsRailState(input: BuildWorkUnitAboveFoldRenderModelInput): WorkUnitAboveFoldSlotState {
    if (!input.work_unit_shell_ready) return "skeleton";
    const resolved = input.enrollment_right_rail_resolved ?? [];
    if (input.reserve_actions_rail && resolved.length === 0) return "skeleton";
    return "ready";
}

function resolveQueueLaneState(input: BuildWorkUnitAboveFoldRenderModelInput): WorkUnitAboveFoldSlotState {
    if (!input.work_unit_shell_ready) return "skeleton";
    if (input.queue_items_error) return "ready";
    if (input.queue_items_ready && !input.queue_items_loading) return "ready";
    return "skeleton";
}

function enrollmentActionsRail(input: BuildWorkUnitAboveFoldRenderModelInput): ActionsVm {
    const base = EMPTY_ACTIONS;
    if (!isEnrollmentLikeDepartmentKey(input.department_key)) return base;
    return mergeEnrollmentRightRailActions(input.enrollment_right_rail_resolved ?? [], base);
}

/**
 * Single above-fold render contract for work-unit — page and workspace read only this for WU chrome.
 */
export function buildWorkUnitAboveFoldRenderModel(
    input: BuildWorkUnitAboveFoldRenderModelInput
): WorkUnitAboveFoldRenderModel {
    const headerState = resolveHeaderState(input);
    const summaries = input.queue_summaries;
    const activeSummary =
        summaries && summaries.length > 0
            ? (input.selected_queue_key
                  ? summaries.find((q) => q.key === input.selected_queue_key) ?? summaries[0]
                  : summaries[0])
            : null;

    const showOtherPill =
        typeof input.unmapped_pill_count === "number" &&
        input.unmapped_pill_count > 0 &&
        Boolean(input.all_records_queue_key) &&
        Boolean(input.other_pill_section_key);

    return {
        header: {
            visible: true,
            state: headerState,
            sections: buildHeaderSections(input),
            error_message: input.queue_summaries_error,
            active_queue_description:
                headerState === "ready" && activeSummary?.description?.trim()
                    ? activeSummary.description.trim()
                    : null,
            show_other_pill: showOtherPill,
            other_pill:
                showOtherPill && input.all_records_queue_key
                    ? {
                          selected:
                              input.lane_unmapped_only &&
                              input.selected_queue_key === input.all_records_queue_key,
                          count: input.unmapped_pill_count ?? "emdash",
                          all_records_queue_key: input.all_records_queue_key,
                      }
                    : null,
        },
        actions_rail: {
            visible: input.reserve_actions_rail,
            state: resolveActionsRailState(input),
            actions_rail: enrollmentActionsRail(input),
        },
        queue_lane: {
            visible: true,
            state: resolveQueueLaneState(input),
            skeleton_row_count: ADMINV2_WORK_UNIT_QUEUE_ROW_SKELETON_COUNT,
        },
    };
}

/** Route placeholder — all slots visible, skeleton geometry (no late mount). */
export function buildWorkUnitAboveFoldPlaceholder(input: {
    reserve_actions_rail?: boolean;
}): WorkUnitAboveFoldRenderModel {
    return buildWorkUnitAboveFoldRenderModel({
        work_unit_shell_ready: false,
        reserve_actions_rail: input.reserve_actions_rail === true,
        queue_summaries: null,
        queue_summaries_error: null,
        queue_pill_sections: null,
        queue_tab_placeholders: null,
        selected_queue_key: null,
        attention_bucket_key: "",
        lane_unmapped_only: false,
        all_records_queue_key: null,
        other_pill_section_key: null,
        unmapped_pill_count: null,
        enrollment_right_rail_resolved: null,
        queue_items_loading: true,
        queue_items_ready: false,
        queue_items_error: null,
    });
}
