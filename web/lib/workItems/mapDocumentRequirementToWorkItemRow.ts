/**
 * Documents → Work Items projection (D6, read-only).
 *
 * An unmet, required document requirement is shown as a work item derived from the Documents evaluator's row — never
 * an `operational_tasks` insert. Completing it is Documents' act (collect, review, file or waive on the record), so
 * Work Items routes the operator there. The row disappears on the next read once Documents says the requirement is
 * satisfied or waived.
 */
import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";
import { REQUIREMENT_STATE_LABEL } from "@/lib/documents/requirements/documentRequirementEvaluator";
import type { RequirementWorkRow } from "@/lib/documents/requirements/documentRequirementService";

export const DOCUMENT_REQUIREMENT_WORK_ITEM_ID_PREFIX = "document_requirement:";

const ENTITY_FOR_SUBJECT: Record<string, string> = { household: "customers", person: "persons", child: "customer_members", opportunity: "opportunities" };

export function isDocumentRequirementProjectedWorkItem(task: Pick<MyTasksTaskRow, "id" | "document_requirement_id">): boolean {
    return Boolean(task.document_requirement_id?.trim() || task.id.trim().startsWith(DOCUMENT_REQUIREMENT_WORK_ITEM_ID_PREFIX));
}

export function mapDocumentRequirementToWorkItemRow(row: RequirementWorkRow): MyTasksTaskRow {
    const verb = row.state === "pending_review" ? "Review" : row.state === "blocked" ? "Resolve" : "Collect";
    return {
        id: row.id,
        title: `${verb}: ${row.requirement_label} — ${row.subject_label}`,
        description: `Documents · ${REQUIREMENT_STATE_LABEL[row.state]} · ${row.document_type_label ?? row.document_type_key}`,
        // The due date is Documents' (the requirement's timing from the record entering scope). With no anchor it orders
        // as due now; projected rows are excluded from due metrics either way (hasAuthoritativeDueCommitment).
        due_at: row.due_on ? `${row.due_on}T17:00:00` : new Date().toISOString(),
        status: "open",
        source: "documents",
        entity_id: row.subject_id,
        entity_type: ENTITY_FOR_SUBJECT[row.subject_type] ?? null,
        assigned_to_user_id: null,
        created_at: row.due_on ? `${row.due_on}T00:00:00Z` : new Date(0).toISOString(),
        document_requirement_id: row.requirement_id,
        document_requirement_state: row.state,
        document_requirement_label: row.requirement_label,
        document_requirement_subject_type: row.subject_type,
        document_requirement_subject_label: row.subject_label,
        is_document_requirement_projection: true,
    };
}

export function mapDocumentRequirementWorkToWorkItemRows(rows: readonly RequirementWorkRow[]): MyTasksTaskRow[] {
    return rows.map(mapDocumentRequirementToWorkItemRow);
}
