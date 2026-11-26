/**
 * Processing → Work Items projection (Needs Review convergence, read-only).
 */

import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";
import type { ProcessingCaseQueueRow } from "@/lib/pos/processingCase/readModel/types";

export const PROCESSING_WORK_ITEM_ID_PREFIX = "processing:";

export function processingWorkItemId(caseId: string): string {
    return `${PROCESSING_WORK_ITEM_ID_PREFIX}${caseId.trim()}`;
}

export function parseProcessingCaseIdFromWorkItemId(id: string): string | null {
    const trimmed = id.trim();
    if (!trimmed.startsWith(PROCESSING_WORK_ITEM_ID_PREFIX)) return null;
    return trimmed.slice(PROCESSING_WORK_ITEM_ID_PREFIX.length) || null;
}

export function isProcessingProjectedWorkItem(task: Pick<MyTasksTaskRow, "id" | "processing_case_id">): boolean {
    return Boolean(task.processing_case_id?.trim() || parseProcessingCaseIdFromWorkItemId(task.id));
}

function deriveProcessingLane(row: ProcessingCaseQueueRow): string {
    if (row.status === "completed" || row.status === "archived") return "completed";
    if (row.formDraftSummary?.generatedFormId) return "ready_publish";
    if (row.status === "ready") return "ready_generate";
    return "needs_review";
}

function defaultDue(iso: string): string {
    const base = Date.parse(iso);
    const d = new Date(Number.isNaN(base) ? Date.now() : base);
    d.setDate(d.getDate() + 1);
    d.setHours(17, 0, 0, 0);
    return d.toISOString();
}

/** Map open Processing cases in Needs Review lane to Work Item queue rows. */
export function mapProcessingCaseToWorkItemRow(row: ProcessingCaseQueueRow): MyTasksTaskRow | null {
    const lane = deriveProcessingLane(row);
    if (lane !== "needs_review") return null;
    if (row.status === "completed" || row.status === "archived") return null;

    const label = row.sourceDisplay?.label?.trim() || row.caseType?.trim() || "Processing case";
    const title = `Review: ${label}`;

    return {
        id: processingWorkItemId(row.id),
        title,
        description: `Processing · ${lane.replace(/_/g, " ")} · ${row.primarySource?.kind ?? "source"}`,
        due_at: defaultDue(row.statusChangedAt || row.createdAt),
        status: "open",
        source: "processing",
        entity_id: null,
        entity_type: null,
        assigned_to_user_id: null,
        created_at: row.createdAt,
        processing_case_id: row.id,
        processing_lane: lane,
        processing_source_label: label,
        is_processing_projection: true,
    };
}

export function mapProcessingQueueToWorkItemRows(rows: ProcessingCaseQueueRow[]): MyTasksTaskRow[] {
    return rows.map(mapProcessingCaseToWorkItemRow).filter((r): r is MyTasksTaskRow => r != null);
}
