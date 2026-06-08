import type { RecordLifecycleRailModel, RecordLifecycleRailStepState } from "@/lib/admin/drawer/resolveRecordLifecycleRailModel";
import type { ChildLifecycleSlotPhase } from "@/lib/admin/person/personDrawerChildLifecycleSlots";
import { resolveChildLifecycleSlotStates } from "@/lib/admin/person/personDrawerChildLifecycleSlots";

/** Lifecycle slots shown on the child drawer post-tab rail. */
export const PERSON_DRAWER_CHILD_LIFECYCLE_RAIL_KEYS = [
    "lead",
    "documents",
    "communications",
    "history",
    "schedule",
    "attendance",
    "billing",
] as const;

function phaseToRailState(phase: ChildLifecycleSlotPhase): RecordLifecycleRailStepState {
    if (phase === "active") return "current";
    if (phase === "idle") return "unknown";
    return "future";
}

/** Map child lifecycle slots to shared RecordLifecycleRail model. */
export function resolvePersonDrawerChildLifecycleRailModel(
    record: Record<string, unknown>
): RecordLifecycleRailModel | null {
    const slots = resolveChildLifecycleSlotStates(record).filter((slot) =>
        PERSON_DRAWER_CHILD_LIFECYCLE_RAIL_KEYS.includes(
            slot.key as (typeof PERSON_DRAWER_CHILD_LIFECYCLE_RAIL_KEYS)[number]
        )
    );

    const visible = slots.filter(
        (slot) => slot.phase !== "future" || ["schedule", "attendance", "billing"].includes(slot.key)
    );

    if (!visible.length) return null;

    const steps = visible.map((slot) => ({
        key: slot.key,
        label: slot.label,
        state: phaseToRailState(slot.phase),
    }));

    const currentIndex = steps.findIndex((s) => s.state === "current");

    return { steps, currentIndex };
}
