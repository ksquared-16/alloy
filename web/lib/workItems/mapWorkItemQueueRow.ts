import { Bot, CheckCircle2, FileSearch, ListTodo, Workflow } from "lucide-react";

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
import { isBusinessProcessStageWorkTaskRow } from "@/lib/lifecycle/isBusinessProcessStageWorkTaskRow";
import { isProcessingProjectedWorkItem } from "@/lib/workItems/mapProcessingCaseToWorkItemRow";
import {
    buildWorkItemProcessingProvenanceChain,
    formatWorkItemProcessingProvenanceChain,
} from "@/lib/workItems/workItemProcessingProvenance";
import {
    buildWorkItemBpBreadcrumb,
    type WorkItemBpLabelOptions,
} from "@/lib/workItems/workItemBpProvenance";

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
    labelOptions?: WorkItemBpLabelOptions,
): string {
    if (isProcessingProjectedWorkItem(task)) {
        return formatWorkItemProcessingProvenanceChain(buildWorkItemProcessingProvenanceChain(task));
    }
    const context = buildMyTasksRecordContextLines(task, presentation, entityLabels);
    const recordLabel = myTasksTaskHasLinkedRecord(task) ? context.entityLabel : null;
    const bpBreadcrumb = buildWorkItemBpBreadcrumb(task, {
        ...labelOptions,
        recordLabel,
    });
    if (bpBreadcrumb) return bpBreadcrumb;

    if (myTasksTaskHasLinkedRecord(task) && context.entityLabel) {
        return ["General work", formatOperationalTaskSourceLabel(task.source), context.entityLabel]
            .filter(Boolean)
            .join(" • ");
    }
    return ["General work", formatOperationalTaskSourceLabel(task.source)].filter(Boolean).join(" • ");
}

export function buildWorkItemBosSummary(task: MyTasksTaskRow, labelOptions?: WorkItemBpLabelOptions): string {
    if (isProcessingProjectedWorkItem(task)) {
        const due = formatOperationalTaskDueDisplay(task.due_at);
        const chain = formatWorkItemProcessingProvenanceChain(buildWorkItemProcessingProvenanceChain(task));
        const detail = task.description?.trim() || "Open in Processing to review.";
        return `${chain} · Due ${due} · ${detail}`;
    }
    const due = formatOperationalTaskDueDisplay(task.due_at);
    const normalizedTitle = normalizeOperationalTaskTitleDisplay(task.title);
    const detail = task.description?.trim() || "No additional BOS notes yet.";

    if (isBusinessProcessStageWorkTaskRow(task)) {
        const bpBreadcrumb = buildWorkItemBpBreadcrumb(task, labelOptions);
        return `${bpBreadcrumb || "Business Process work"} · Due ${due} · ${detail}`;
    }

    const sourceLabel = formatOperationalTaskSourceLabel(task.source);
    return `${sourceLabel} · ${normalizedTitle} · Due ${due} · ${detail}`;
}

export function mapWorkItemQueueRow(
    task: MyTasksTaskRow,
    options: {
        presentation: MyTasksPresentationLabels;
        entityLabels: EntityLabelsMap;
        labelOptions?: WorkItemBpLabelOptions;
    },
): WorkspaceQueueRowModel {
    const urgency = operationalTaskUrgencyBadge(task).urgency;
    const isCompleted = urgency === "completed" || urgency === "canceled";
    const isProcessing = isProcessingProjectedWorkItem(task);
    const isBpWork = !isProcessing && isBusinessProcessStageWorkTaskRow(task);
    const source = task.source.trim().toLowerCase();
    const isWaiting = !isBpWork && task.status.trim().toLowerCase() === "open" && source === "task_assist";

    return {
        id: task.id,
        leadingIcon: isProcessing ? FileSearch : isBpWork ? Workflow : source === "task_assist" ? Bot : source === "manual" ? ListTodo : CheckCircle2,
        title: normalizeOperationalTaskTitleDisplay(task.title),
        badge: isProcessing ? "Processing" : isBpWork ? "BP" : source === "task_assist" ? "BOS" : undefined,
        breadcrumb: buildWorkItemBreadcrumb(task, options.presentation, options.entityLabels, options.labelOptions),
        snippet: task.description?.trim() || undefined,
        dueOrTime: `Due ${formatOperationalTaskDueDisplay(task.due_at)}`,
        assigneeInitials: assigneeInitials(task.assignee_label),
        trailingMeta: isProcessing ? "Needs review" : isBpWork ? "Business Process" : formatOperationalTaskSourceLabel(task.source),
        urgency,
        isWaiting,
        completed: isCompleted,
    };
}
