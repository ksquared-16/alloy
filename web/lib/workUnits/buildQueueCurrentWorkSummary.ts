import type { InquirySummaryTaskPreviewPayload } from "@/lib/admin/drawer/opportunityInquirySummaryTaskPreview";
import { operationalTaskDueUrgency } from "@/lib/agent/taskAssist/taskAssistOperationalUrgency";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { WorkIntentRuntimeProjection } from "@/lib/lifecycle/workIntentRuntimeTypes";

export type QueueRowCurrentWorkSummary = {
    label: string;
    state: "open" | "completed" | "none";
    due_label: string | null;
};

const DUE_LABEL = {
    overdue: "Overdue",
    due_today: "Due today",
    upcoming: "Upcoming",
} as const;

function dueLabelFromIso(dueAt: string | null | undefined): string | null {
    const iso = dueAt?.trim();
    if (!iso) return null;
    const urgency = operationalTaskDueUrgency({ status: "open", dueAtIso: iso });
    if (urgency === "overdue") return DUE_LABEL.overdue;
    if (urgency === "due_soon") return DUE_LABEL.due_today;
    if (urgency === "open") return DUE_LABEL.upcoming;
    return null;
}

/** Smallest queue-row current work summary from stage runtime or task preview. */
export function buildQueueCurrentWorkSummary(row: Record<string, unknown>): QueueRowCurrentWorkSummary | null {
    const runtime = row._stage_work_runtime;
    if (runtime && typeof runtime === "object" && !Array.isArray(runtime)) {
        const stageRuntime = runtime as StageWorkRuntimeProjection;
        const primary = stageRuntime.primary;
        if (primary && primary.state !== "none") {
            return {
                label: primary.label,
                state: primary.state,
                due_label: primary.state === "open" ? dueLabelFromIso(primary.due_at) : null,
            };
        }
    }

    const workIntent = row._work_intent_runtime;
    if (workIntent && typeof workIntent === "object" && !Array.isArray(workIntent)) {
        const primary = workIntent as WorkIntentRuntimeProjection;
        if (primary.state !== "none") {
            return {
                label: primary.label,
                state: primary.state,
                due_label: primary.state === "open" ? dueLabelFromIso(primary.due_at) : null,
            };
        }
    }

    const preview = row._inquiry_summary_tasks as InquirySummaryTaskPreviewPayload | undefined;
    if (!preview || preview.state !== "loaded") return null;

    const stageTask =
        preview.open_tasks.find((t) => t.work_intent_key?.trim() || t.lifecycle_provenance === "lifecycle_template") ??
        null;
    if (!stageTask) return null;

    return {
        label: stageTask.title.trim() || "Current work",
        state: "open",
        due_label: dueLabelFromIso(stageTask.due_at),
    };
}

export function formatQueueCurrentWorkLine(summary: QueueRowCurrentWorkSummary | null): string | null {
    if (!summary) return null;
    const stateLabel = summary.state === "open" ? "Open" : summary.state === "completed" ? "Completed" : "";
    const parts = [summary.label.trim(), stateLabel].filter(Boolean);
    if (summary.due_label) parts.push(summary.due_label);
    return parts.join(" · ") || null;
}
