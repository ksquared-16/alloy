/**
 * Work Items V3 — shared draft validation (presentation-independent).
 */

import type { ValidationIssueV1, WorkItemDraftV1 } from "@/lib/workItems/workItemDraftV1";

export type WorkItemDraftValidationResult = {
    issues: ValidationIssueV1[];
    blockingIssues: ValidationIssueV1[];
    canCommit: boolean;
};

function isValidIsoDate(value: string | undefined): boolean {
    if (!value?.trim()) return false;
    const d = new Date(value);
    return !Number.isNaN(d.getTime());
}

export function validateWorkItemDraft(draft: WorkItemDraftV1): WorkItemDraftValidationResult {
    const issues: ValidationIssueV1[] = [];

    if (!draft.title.trim()) {
        issues.push({
            code: "missing_title",
            message: "Add a clear title for this work item.",
            severity: "block",
            field: "title",
        });
    }

    if (!draft.due_at?.trim() || !isValidIsoDate(draft.due_at)) {
        issues.push({
            code: "missing_due",
            message: "Set when this work is due.",
            severity: "block",
            field: "due_at",
        });
    }

    if (!draft.assigned_to_user_id?.trim()) {
        issues.push({
            code: "missing_assignee",
            message: "Choose who owns this work item.",
            severity: "block",
            field: "assigned_to_user_id",
        });
    }

    if (draft.link_mode === "linked" && !draft.entity?.id?.trim()) {
        issues.push({
            code: "missing_entity",
            message: "Select the record this work item is linked to.",
            severity: "block",
            field: "entity",
        });
    }

    if (draft.follow_on?.length) {
        for (const rule of draft.follow_on) {
            if (rule.due_at && draft.due_at && new Date(rule.due_at).getTime() < new Date(draft.due_at).getTime()) {
                issues.push({
                    code: "invalid_follow_on",
                    message: "Follow-on work must be due after the primary due date.",
                    severity: "block",
                    field: "follow_on",
                });
                break;
            }
        }
    }

    const blockingIssues = issues.filter((i) => i.severity === "block");
    const canCommit =
        blockingIssues.length === 0 &&
        draft.status !== "committed" &&
        draft.status !== "cancelled";

    return { issues, blockingIssues, canCommit };
}
