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

/** Process instance / effective lifecycle stage label for `queue_row.stage_label`. */
export function resolveQueueRowProcessStageLabel(context: QueueRowContext): string | null {
    const laneStage = trimOrNull(context.row_stage);
    if (laneStage) return laneStage;

    const drawer = context.drawer_open;
    const stageKey =
        trimOrNull(drawer?.stage_focus_key)
        ?? trimOrNull(drawer?.active_subject?.stage_key);
    if (stageKey) return humanizeSnakeCaseToken(stageKey);

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
