/**
 * Pure resolver: what a queue row warms.
 *
 * Given a queue row and the work-unit scope, returns the id + workspace context + preview seed
 * to prefetch the Focus Panel record VM with — the SAME identity `openRecord` will open, so a
 * hover/focus warm lands exactly the record a click would. Returns null for non-opportunity
 * rows (jobs/schedules resolve their own surfaces) and when the work-unit scope is unresolved,
 * so callers no-op. No side effects — the single source of "what a row warms", shared by the
 * hover intent and the first-row auto-open warm.
 */
import type { OpportunityDrawerIntentContext } from "@/lib/admin/opportunityDrawerIntentPrefetch";
import type { OpportunityDrawerQueuePreviewSeed } from "@/lib/admin/opportunityDrawerQueuePreviewSeed";
import { opportunityQueuePreviewSeedFromRowContext, type QueueRowModel } from "./types";

export type QueueRowWarmScope = {
    departmentId: string | null | undefined;
    workUnitId: string | null | undefined;
    workViewId: string | null;
};

export type QueueRowWarmTarget = {
    id: string;
    context: OpportunityDrawerIntentContext;
    seed: OpportunityDrawerQueuePreviewSeed | null;
};

export function resolveQueueRowWarmTarget(
    row: QueueRowModel,
    scope: QueueRowWarmScope,
): QueueRowWarmTarget | null {
    if (row.entityType !== "opportunity") return null;
    const departmentId = scope.departmentId?.trim();
    const workUnitId = scope.workUnitId?.trim();
    if (!departmentId || !workUnitId) return null;
    // Grouped rows anchor on the case opportunity (drawer_open); else the row's own entity id.
    const anchoredOpportunityId = row.context?.drawer_open?.entity_id?.trim();
    /**
     * `entityType` is NOT the child discriminator. It stays `"opportunity"` for Enrollment rows
     * including child-grain subjects (see `focusPanelSeedFromQueueRow`); the canonical signal is
     * `context.row_subject.subject_type`.
     *
     * A child-grain row's own `entityId` is a PARTICIPATION id, not an opportunity. Falling back
     * to it warmed the opportunity VM with a child id and 404'd —
     * `GET /api/admin/view-models/drawer/opportunity/<participation-id>` fired on every hover,
     * focus and pointer-down of a Waitlist row. A child row only has an opportunity worth warming
     * when `drawer_open` anchors it to its case; otherwise there is nothing here to prefetch.
     */
    const subjectType = row.context?.row_subject?.subject_type;
    const isChildSubject = subjectType === "child" || subjectType === "candidate";
    if (isChildSubject && !anchoredOpportunityId) return null;
    const id = anchoredOpportunityId || row.entityId;
    if (!id) return null;
    return {
        id,
        context: {
            work_unit_id: workUnitId,
            department_id: departmentId,
            work_view_id: scope.workViewId ?? null,
        },
        seed: opportunityQueuePreviewSeedFromRowContext(row.context),
    };
}
