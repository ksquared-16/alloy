/**
 * Queue row Stage vs Status label resolution from frozen `QueueRowContext`.
 *
 * Stage = process / lifecycle stage on the record (Lead, Tour, Enrolling, …).
 * Status = record disposition (Open, New Lead, Waitlisted, …).
 * Work View names (New Leads, Active Pipeline) are lane filters — not Stage.
 */

import { humanizeSnakeCaseToken } from "@/lib/admin/activityTimelineFormat";
import type { QueueRowContext } from "@/lib/workUnits/lifecycleSubjectContracts";

function trimOrNull(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

/**
 * Process instance / effective lifecycle stage label for `queue_row.stage_label`.
 *
 * The SUBJECT's stage wins. `row_stage` is contractually the queue LANE label, and a Work View
 * scopes a list of stages — so preferring it made every row in a lane show the view's own name
 * ("New Leads") instead of where that family actually is. The lane stays as the last resort for
 * rows that carry no stage of their own; its meaning is unchanged (grouped rows rely on it).
 */
export function resolveQueueRowProcessStageLabel(context: QueueRowContext): string | null {
    const drawer = context.drawer_open;
    const stageKey =
        trimOrNull(drawer?.stage_focus_key)
        ?? trimOrNull(drawer?.active_subject?.stage_key);
    if (stageKey) {
        return trimOrNull(context.stage_labels_by_key?.[stageKey]) ?? humanizeSnakeCaseToken(stageKey);
    }

    return trimOrNull(context.row_stage);
}

/** Record / row status label for `opportunity.status_label`. */
export function resolveQueueRowRecordStatusLabel(context: QueueRowContext): string | null {
    return (
        trimOrNull(context.row_status_label)
        ?? trimOrNull(context.case_context?.case_status_label)
        ?? null
    );
}
