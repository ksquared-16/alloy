import { Bot, CheckCircle2, ListTodo } from "lucide-react";

import type { EntityLabelsMap } from "@/contexts/EntityLabelsContext";
import {
    formatOperationalTaskDueDisplay,
    formatOperationalTaskSourceLabel,
} from "@/lib/agent/taskAssist/formatOperationalTaskSourceLabel";
import type { MyTasksPresentationLabels } from "@/lib/agent/taskAssist/myTasksPresentationLabels";
import {
    buildMyTasksRecordContextLines,
    myTasksTaskHasLinkedRecord,
} from "@/lib/agent/taskAssist/myTasksRecordContextPresentation";
import { normalizeOperationalTaskTitleDisplay } from "@/lib/agent/taskAssist/normalizeOperationalTaskTitleDisplay";
import { operationalTaskUrgencyBadge } from "@/lib/agent/taskAssist/taskAssistOperationalUrgency";
import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";
import type { WorkspaceQueueRowUrgency } from "@/components/workspace/WorkspaceQueueRow";

export type WorkspaceQueueRowModel = {
    id: string;
    leadingIcon: typeof ListTodo;
    title: string;
    badge?: string;
    breadcrumb: string;
    snippet?: string;
    dueOrTime?: string;
    assigneeInitials?: string;
    trailingMeta?: string;
    urgency: WorkspaceQueueRowUrgency;
    isWaiting: boolean;
    completed: boolean;
};

function assigneeInitials(label: string | null | undefined): string | undefined {
    const text = (label ?? "").trim();
    if (!text) return undefined;
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return undefined;
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

export function buildWorkItemBreadcrumb(
    task: MyTasksTaskRow,
    presentation: MyTasksPresentationLabels,
    entityLabels: EntityLabelsMap,
): string {
    const context = buildMyTasksRecordContextLines(task, presentation, entityLabels);
    const processLabel = task.department_id?.trim() ? "Business process" : "General work";
    const stageLabel = task.lifecycle_stage_key?.trim()?.replace(/[_-]+/g, " ") ?? null;
    const stageDisplay = stageLabel ? stageLabel.replace(/\b\w/g, (c) => c.toUpperCase()) : null;

    if (myTasksTaskHasLinkedRecord(task) && context.entityLabel) {
        return [processLabel, stageDisplay, context.entityLabel].filter(Boolean).join(" • ");
    }
    return [processLabel, stageDisplay, formatOperationalTaskSourceLabel(task.source)].filter(Boolean).join(" • ");
}

export function buildWorkItemBosSummary(task: MyTasksTaskRow): string {
    const sourceLabel = formatOperationalTaskSourceLabel(task.source);
    const due = formatOperationalTaskDueDisplay(task.due_at);
    const normalizedTitle = normalizeOperationalTaskTitleDisplay(task.title);
    const detail = task.description?.trim() || "No additional BOS notes yet.";
    return `${sourceLabel} · ${normalizedTitle} · Due ${due} · ${detail}`;
}

export function mapWorkItemQueueRow(
    task: MyTasksTaskRow,
    options: {
        presentation: MyTasksPresentationLabels;
        entityLabels: EntityLabelsMap;
    },
): WorkspaceQueueRowModel {
    const urgency = operationalTaskUrgencyBadge(task).urgency;
    const isCompleted = urgency === "completed" || urgency === "canceled";
    const isWaiting = task.status.trim().toLowerCase() === "open" && task.source.trim().toLowerCase() === "task_assist";
    const source = task.source.trim().toLowerCase();

    return {
        id: task.id,
        leadingIcon: source === "task_assist" ? Bot : source === "manual" ? ListTodo : CheckCircle2,
        title: normalizeOperationalTaskTitleDisplay(task.title),
        badge: source === "task_assist" ? "BOS" : undefined,
        breadcrumb: buildWorkItemBreadcrumb(task, options.presentation, options.entityLabels),
        snippet: task.description?.trim() || undefined,
        dueOrTime: `Due ${formatOperationalTaskDueDisplay(task.due_at)}`,
        assigneeInitials: assigneeInitials(task.assignee_label),
        trailingMeta: formatOperationalTaskSourceLabel(task.source),
        urgency,
        isWaiting,
        completed: isCompleted,
    };
}
