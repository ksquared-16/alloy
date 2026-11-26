/**
 * Work Items V3 — commit adapter (reuses existing operational_tasks API).
 */

import { buildOperationalTaskBody } from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import type { WorkItemDraftV1 } from "@/lib/workItems/workItemDraftV1";
import { validateWorkItemDraft } from "@/lib/workItems/validateWorkItemDraft";

export function draftToOperationalTaskBody(draft: WorkItemDraftV1) {
    const validation = validateWorkItemDraft(draft);
    if (!validation.canCommit) {
        throw new Error(validation.blockingIssues[0]?.message ?? "Work item draft is not ready to create.");
    }

    if (!draft.due_at?.trim()) {
        throw new Error("Due date is required.");
    }

    return buildOperationalTaskBody({
        entityId: draft.entity?.id ?? null,
        title: draft.title,
        dueAtIso: draft.due_at,
        description: draft.description ?? null,
        source: "manual",
        proposalId: draft.provenance.proposal_id ?? null,
        assignedToUserId: draft.assigned_to_user_id ?? null,
        workDefinitionKey: draft.work_definition_key ?? null,
    });
}
