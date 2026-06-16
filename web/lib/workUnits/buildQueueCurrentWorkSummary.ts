import type { InquirySummaryTaskPreviewPayload } from "@/lib/admin/drawer/opportunityInquirySummaryTaskPreview";
import { operationalTaskDueUrgency } from "@/lib/agent/taskAssist/taskAssistOperationalUrgency";
import type { StageWorkItemProjection, StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { WorkIntentRuntimeProjection, WorkIntentRuntimeState } from "@/lib/lifecycle/workIntentRuntimeTypes";

export type QueueRowCurrentWorkSummary = {
    label: string;
    state: WorkIntentRuntimeState;
    due_label: string | null;
};

const DUE_LABEL = {
    overdue: "Overdue",
    due_today: "Due today",
    upcoming: "Upcoming",
} as const;

const STATE_LABEL: Record<string, string> = {
    open: "Open",
    planned: "Planned",
    completed: "Completed",
};

function normalizeState(state: WorkIntentRuntimeState): WorkIntentRuntimeState {
    return state === "none" ? "planned" : state;
}

function dueLabelFromIso(dueAt: string | null | undefined): string | null {
    const iso = dueAt?.trim();
    if (!iso) return null;
    const urgency = operationalTaskDueUrgency({ status: "open", dueAtIso: iso });
    if (urgency === "overdue") return DUE_LABEL.overdue;
    if (urgency === "due_soon") return DUE_LABEL.due_today;
    if (urgency === "open") return DUE_LABEL.upcoming;
    return null;
}

function queueLabelForWorkItem(item: StageWorkItemProjection): string {
    if (item.state === "open" && item.last_outcome?.label) {
        return item.last_outcome.label;
    }
    return item.label;
}

/** Pick the operator-facing current work line from stage runtime projection. */
export function pickQueueCurrentWorkItem(
    runtime: StageWorkRuntimeProjection,
): StageWorkItemProjection | null {
    const items = [runtime.primary, ...runtime.additional].filter(
        (item): item is StageWorkItemProjection => item != null,
    );
    const openItems = items.filter((item) => normalizeState(item.state) === "open");
    if (openItems.length) return openItems[0]!;

    const plannedItems = items.filter((item) => normalizeState(item.state) === "planned");
    if (plannedItems.length) return plannedItems[0]!;

    const completedItems = items.filter((item) => normalizeState(item.state) === "completed");
    if (completedItems.length) return completedItems[completedItems.length - 1]!;

    return null;
}

function summaryFromStageWorkItem(item: StageWorkItemProjection): QueueRowCurrentWorkSummary {
    const state = normalizeState(item.state);
    return {
        label: queueLabelForWorkItem(item),
        state,
        due_label: state === "open" ? dueLabelFromIso(item.due_at) : null,
    };
}

/** Smallest queue-row current work summary from stage runtime or task preview. */
export function buildQueueCurrentWorkSummary(row: Record<string, unknown>): QueueRowCurrentWorkSummary | null {
    const runtime = row._stage_work_runtime;
    if (runtime && typeof runtime === "object" && !Array.isArray(runtime)) {
        const stageRuntime = runtime as StageWorkRuntimeProjection;
        const item = pickQueueCurrentWorkItem(stageRuntime);
        if (item) return summaryFromStageWorkItem(item);
    }

    const workIntent = row._work_intent_runtime;
    if (workIntent && typeof workIntent === "object" && !Array.isArray(workIntent)) {
        const primary = workIntent as WorkIntentRuntimeProjection;
        const state = normalizeState(primary.state);
        if (state !== "none") {
            return {
                label: primary.label,
                state,
                due_label: state === "open" ? dueLabelFromIso(primary.due_at) : null,
            };
        }
    }

    const preview = row._inquiry_summary_tasks as InquirySummaryTaskPreviewPayload | undefined;
    if (!preview || preview.state !== "loaded") return null;

    const stageTask =
        preview.open_tasks.find((t) => {
            const templateKey = t.operating_plan_template_key?.trim() || t.work_intent_key?.trim();
            return Boolean(templateKey) && t.lifecycle_provenance === "lifecycle_template";
        }) ?? null;
    if (!stageTask) return null;

    return {
        label: stageTask.title.trim() || "Current work",
        state: "open",
        due_label: dueLabelFromIso(stageTask.due_at),
    };
}

export function formatQueueCurrentWorkLine(summary: QueueRowCurrentWorkSummary | null): string | null {
    if (!summary) return null;
    const state = normalizeState(summary.state);
    const stateLabel = STATE_LABEL[state] ?? "";
    const parts = [summary.label.trim(), stateLabel].filter(Boolean);
    if (summary.due_label) parts.push(summary.due_label);
    return parts.join(" · ") || null;
}
