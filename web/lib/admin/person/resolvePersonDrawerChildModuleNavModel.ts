import type { ChildLifecycleSlotPhase } from "@/lib/admin/person/personDrawerChildLifecycleSlots";
import { resolveChildLifecycleSlotStates } from "@/lib/admin/person/personDrawerChildLifecycleSlots";

export type PersonDrawerChildModuleNavItem = {
    key: string;
    label: string;
    phase: ChildLifecycleSlotPhase;
    /** Module is clickable in the drawer chrome. */
    actionable: boolean;
};

const MODULE_KEYS = ["documents", "communications", "activity", "schedule", "attendance", "billing"] as const;

/** Operational module shortcuts — separate from enrollment pipeline rail. */
export function resolvePersonDrawerChildModuleNavModel(
    record: Record<string, unknown>
): PersonDrawerChildModuleNavItem[] {
    const slots = new Map(resolveChildLifecycleSlotStates(record).map((slot) => [slot.key, slot]));

    return MODULE_KEYS.map((key) => {
        const slotKey = key === "activity" ? "history" : key;
        const slot = slots.get(slotKey);
        const label = key === "activity" ? "Activity" : slot?.label ?? key;
        const phase = slot?.phase ?? "future";

        let actionable = false;
        if (key === "documents") actionable = true;
        if (key === "communications") actionable = true;
        if (key === "activity") actionable = true;

        return { key, label, phase, actionable };
    });
}
