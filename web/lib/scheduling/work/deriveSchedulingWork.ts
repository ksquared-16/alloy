/**
 * Derives Operational Work items from a child's scheduling projection.
 *
 * Implements the Identity / Work separation of
 * `docs/platform/planning/scheduling-focus-panel-composition.md` §2: the
 * identity Summary card carries durable truth only; the *reasons you opened the
 * child today* (needs-placement, start approaching, over-ratio, proposed change)
 * are Operational Work, present only when work exists. This is pure over the
 * canonical projection — the Work card renders these, it computes nothing.
 *
 * V1 / Milestone 1 surfaces `needs-placement` (→ "Place …"). Over-ratio and
 * proposed-change work is added by the workspace detectors (Phase 2), which
 * enrich the same item shape with room/date context.
 */

import type { ChildScheduling } from "@/lib/scheduling/projection/schedulingProjectionTypes";

export type SchedulingWorkKind =
    | "needs-placement"
    | "start-approaching"
    | "over-ratio"
    | "proposed-change";

export type SchedulingWorkItem = {
    kind: SchedulingWorkKind;
    childId: string;
    childName: string;
    /** Plain operator sentence — the "why am I here" line. */
    title: string;
    /** The situation-specific verb, never a generic "Resolve". */
    actionLabel: string;
    /** The configured command the action launches (resolved by the Action Runtime). */
    actionCommandKey: string;
    /** Higher = more urgent (severity × urgency, refined by the workspace detectors). */
    severity: number;
};

function firstName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) return "this child";
    return trimmed.split(/\s+/)[0]!;
}

/**
 * Pure: derive the Work items for one child. Returns `[]` for a healthy, placed
 * child — in which case the Focus Panel shows identity only (no Work card).
 */
export function deriveSchedulingWork(child: ChildScheduling): SchedulingWorkItem[] {
    const items: SchedulingWorkItem[] = [];
    const name = child.child.name;

    if (child.status === "needs-placement") {
        // Enrolled but unscheduled — the Place-a-Child entry.
        items.push({
            kind: "needs-placement",
            childId: child.child.id,
            childName: name,
            title: "Needs a room",
            actionLabel: `Place ${firstName(name)}`,
            actionCommandKey: "schedule.create",
            severity: 70,
        });
    }

    return items;
}

/** Whether the Focus Panel should render a Work card for this child at all. */
export function hasSchedulingWork(child: ChildScheduling): boolean {
    return deriveSchedulingWork(child).length > 0;
}
