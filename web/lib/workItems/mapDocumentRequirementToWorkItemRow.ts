/**
 * Documents → Work Items projection (D6, read-only).
 *
 * An unmet, required document requirement is shown as a work item derived from the Documents evaluator's row — never
 * an `operational_tasks` insert. Completing it is Documents' act (collect, review, file or waive on the record), so
 * Work Items routes the operator there. The row disappears on the next read once Documents says the requirement is
 * satisfied or waived.
 */
import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";
import { REQUIREMENT_WORK_STATE_LABEL } from "@/lib/documents/requirements/documentRequirementEvaluator";
import type { RequirementWorkRow } from "@/lib/documents/requirements/documentRequirementService";
import { DOCUMENT_ATTENTION_LABEL, type DocumentAttentionRow } from "@/lib/documents/validity/documentAttentionVocabulary";

export const DOCUMENT_REQUIREMENT_WORK_ITEM_ID_PREFIX = "document_requirement:";
/** D7: derived document-attention rows (expired, expiring soon, review due, date missing). */
export const DOCUMENT_ATTENTION_WORK_ITEM_ID_PREFIX = "document_attention:";

const ENTITY_FOR_SUBJECT: Record<string, string> = { household: "customers", person: "persons", child: "customer_members", opportunity: "opportunities" };

export function isDocumentRequirementProjectedWorkItem(task: Pick<MyTasksTaskRow, "id" | "document_requirement_id">): boolean {
    const id = task.id.trim();
    return Boolean(task.document_requirement_id?.trim() || id.startsWith(DOCUMENT_REQUIREMENT_WORK_ITEM_ID_PREFIX) || id.startsWith(DOCUMENT_ATTENTION_WORK_ITEM_ID_PREFIX));
}

export function mapDocumentRequirementToWorkItemRow(row: RequirementWorkRow): MyTasksTaskRow {
    // R1: an expiring requirement whose renewal is already on file awaiting review is review work, not renewal work.
    const verb =
        row.state === "pending_review" || row.renewal === "pending"
            ? "Review"
            : row.state === "blocked"
              ? "Resolve"
              : row.state === "expired" || row.state === "expiring_soon"
                ? "Renew"
                : "Collect";
    return {
        id: row.id,
        title: `${verb}: ${row.requirement_label} — ${row.subject_label}`,
        description: `Documents · ${REQUIREMENT_WORK_STATE_LABEL[row.state]} · ${row.document_type_label ?? row.document_type_key}`,
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

/** D7: one document's own attention (validity or review) as a work item. Never stored; gone once resolved. */
export function mapDocumentAttentionToWorkItemRow(row: DocumentAttentionRow): MyTasksTaskRow {
    const verb = row.kind === "review_due" ? "Review" : row.kind === "date_missing" ? "Record dates" : "Renew";
    return {
        id: row.id,
        title: `${verb}: ${row.document_type_label} — ${row.subject_label}`,
        description: `Documents · ${DOCUMENT_ATTENTION_LABEL[row.kind]}${row.expires_on ? ` · expires ${row.expires_on}` : ""}`,
        due_at: row.due_on ? `${row.due_on}T17:00:00` : new Date().toISOString(),
        status: "open",
        source: "documents",
        entity_id: row.subject_id,
        entity_type: ENTITY_FOR_SUBJECT[row.subject_type] ?? null,
        assigned_to_user_id: null,
        created_at: row.due_on ? `${row.due_on}T00:00:00Z` : new Date(0).toISOString(),
        document_requirement_id: null,
        document_requirement_state: null,
        document_requirement_label: row.document_type_label,
        document_requirement_subject_type: row.subject_type,
        document_requirement_subject_label: row.subject_label,
        document_attention_kind: row.kind,
        document_attention_document_id: row.document_id,
        is_document_requirement_projection: true,
    };
}

export function mapDocumentRequirementWorkToWorkItemRows(rows: readonly RequirementWorkRow[], documents: readonly DocumentAttentionRow[] = []): MyTasksTaskRow[] {
    return [...rows.map(mapDocumentRequirementToWorkItemRow), ...documents.map(mapDocumentAttentionToWorkItemRow)];
}
