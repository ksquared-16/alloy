/**
 * Operator-facing layout assignment slots per BP stage.
 * Maps friendly slot labels → surface_key for persistence/resolution.
 */

import type { LayoutAssignmentSurfaceKey } from "@/lib/layout/businessProcessLayoutAssignmentTypes";

export type LayoutAssignmentSlotId =
    | "drawer"
    | "queue"
    | "waitlist_queue"
    | "child_drawer"
    | "person_drawer";

export type LayoutAssignmentSlotDefinition = {
    slotId: LayoutAssignmentSlotId;
    /** Operator label in BP settings */
    label: string;
    surfaceKey: LayoutAssignmentSurfaceKey;
    optional?: boolean;
};

/** Stage-specific layout slots shown in Business Process settings. */
export function layoutAssignmentSlotsForStage(stageKey: string): readonly LayoutAssignmentSlotDefinition[] {
    const stage = stageKey.trim().toLowerCase();
    const isWaitlist = stage === "waitlist";
    const isEnrolled = stage === "enrolled";

    if (isEnrolled) {
        return [
            { slotId: "queue", label: "Queue Row Surface", surfaceKey: "queue_record" },
            { slotId: "child_drawer", label: "Focus Panel Surface", surfaceKey: "child_drawer" },
        ];
    }

    const slots: LayoutAssignmentSlotDefinition[] = [
        {
            slotId: isWaitlist ? "waitlist_queue" : "queue",
            label: isWaitlist ? "Waitlist Queue Row Surface" : "Queue Row Surface",
            surfaceKey: isWaitlist ? "waitlist_queue_record" : "queue_record",
        },
        { slotId: "drawer", label: "Focus Panel Surface", surfaceKey: "opportunity_drawer" },
    ];

    if (stage === "enrollment") {
        slots.push({
            slotId: "child_drawer",
            label: "Child Focus Panel Surface",
            surfaceKey: "child_drawer",
            optional: true,
        });
    }

    return slots;
}

export function surfaceKeyForLayoutAssignmentSlot(
    stageKey: string,
    slotId: LayoutAssignmentSlotId,
): LayoutAssignmentSurfaceKey | null {
    const slot = layoutAssignmentSlotsForStage(stageKey).find((s) => s.slotId === slotId);
    return slot?.surfaceKey ?? null;
}
