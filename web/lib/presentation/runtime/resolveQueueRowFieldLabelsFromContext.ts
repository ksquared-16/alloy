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
 * Process / Effective Process Position label for `queue_row.stage_label`.
 *
 * Prefer `row_stage` — for family inventory this is the EPP rollup (participant stages),
 * not raw `opportunities.stage_key`. Drawer stage_focus_key remains a focus hint for the
 * Focus Panel, not the queue-row "where is this family now" chip.
 *
 * Fall back to drawer stage keys only when `row_stage` is absent (legacy rows).
 */
export function resolveQueueRowProcessStageLabel(context: QueueRowContext): string | null {
    const fromRow = trimOrNull(context.row_stage);
    if (fromRow) return fromRow;

    const drawer = context.drawer_open;
    const stageKey =
        trimOrNull(drawer?.stage_focus_key)
        ?? trimOrNull(drawer?.active_subject?.stage_key);
    if (stageKey) {
        return trimOrNull(context.stage_labels_by_key?.[stageKey]) ?? humanizeSnakeCaseToken(stageKey);
    }

    return null;
}

/** Record / row status label for `opportunity.status_label`. */
export function resolveQueueRowRecordStatusLabel(context: QueueRowContext): string | null {
    return (
        trimOrNull(context.row_status_label)
        ?? trimOrNull(context.case_context?.case_status_label)
        ?? null
    );
}
