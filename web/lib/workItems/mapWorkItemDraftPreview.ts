import { formatOperationalTaskDueDisplay } from "@/lib/agent/taskAssist/formatOperationalTaskSourceLabel";
import type { WorkItemDraftV1 } from "@/lib/workItems/workItemDraftV1";

export type WorkItemDraftPreviewModel = {
    title: string;
    categoryLabel: string;
    recordLabel: string;
    processLabel: string;
    dueLabel: string;
    assigneeLabel: string;
    priorityLabel: string;
    waitingLabel: string | null;
    followOnLabel: string | null;
    checklistLabel: string;
    bosSummary: string;
    provenanceLabel: string;
    tags: string[];
};

export function mapWorkItemDraftPreview(draft: WorkItemDraftV1): WorkItemDraftPreviewModel {
    const title = draft.title.trim() || "Untitled work item";
    const categoryLabel = draft.category?.replace(/[_-]+/g, " ") ?? "General";
    const recordLabel =
        draft.entity?.label?.trim() || draft.entity?.id?.trim() ?
            (draft.entity?.label?.trim() || "Linked record")
        :   "General work (no record)";
    const processLabel = draft.business_process?.label?.trim() || "Manual";
    const dueLabel = draft.due_at ? formatOperationalTaskDueDisplay(draft.due_at) : "Not set";
    const assigneeLabel = draft.assigned_to_user_id?.trim() ? "Assigned" : "Unassigned";
    const priorityLabel = draft.priority ?? "medium";
    const waitingLabel = draft.waiting_on?.label?.trim() ?? null;
    const followOnCount = draft.follow_on?.length ?? 0;
    const followOnLabel = followOnCount > 0 ? `${followOnCount} follow-on rule(s)` : null;
    const detail = draft.description?.trim() || "No additional notes yet.";
    const bosSummary = `Manual · ${title} · Due ${dueLabel} · ${detail}`;

    return {
        title,
        categoryLabel: categoryLabel.replace(/\b\w/g, (c) => c.toUpperCase()),
        recordLabel,
        processLabel,
        dueLabel,
        assigneeLabel,
        priorityLabel: priorityLabel.replace(/\b\w/g, (c) => c.toUpperCase()),
        waitingLabel,
        followOnLabel,
        checklistLabel: "Checklist available after Business Process link (deferred)",
        bosSummary,
        provenanceLabel: draft.provenance.entry_point.replace(/_/g, " "),
        tags: draft.tags ?? [],
    };
}
