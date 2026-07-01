"use client";

import { resolvePersonDrawerProfileFromRecord } from "@/components/admin/entity/PersonDrawerProfileBadges";
import {
    CHILD_LIFECYCLE_ROADMAP_UX,
    personDrawerShowsChildLifecycleSurface,
    resolveChildLifecycleSlotStates,
    type ChildLifecycleSlotPhase,
    type ChildLifecycleSlotState,
} from "@/lib/admin/person/personDrawerChildLifecycleSlots";
import { oppInqEyebrow } from "@/components/admin/drawer/opportunityInquiryDrawerTypography";

function stepDotClass(phase: ChildLifecycleSlotPhase): string {
    if (phase === "active") {
        return "border-[rgb(0,162,131)] bg-[rgb(0,162,131)]/15 ring-2 ring-[rgb(0,162,131)]/20";
    }
    if (phase === "idle") {
        return "border-alloy-stone/30 bg-white";
    }
    return "border-dashed border-alloy-stone/20 bg-alloy-stone/[0.03]";
}

function stepLabelClass(phase: ChildLifecycleSlotPhase): string {
    if (phase === "active") return "font-semibold text-[rgb(0,100,80)]";
    if (phase === "idle") return "text-alloy-midnight/45";
    return "text-alloy-midnight/30";
}

function LifecycleStep({
    slot,
    isLast,
}: {
    slot: ChildLifecycleSlotState;
    isLast: boolean;
}) {
    return (
        <li
            className="flex min-w-[3.25rem] flex-1 flex-col items-center gap-1"
            data-child-lifecycle-slot={slot.key}
            data-child-lifecycle-phase={slot.phase}
        >
            <div className="flex w-full items-center">
                <span
                    className={`mx-auto block h-2 w-2 shrink-0 rounded-full border ${stepDotClass(slot.phase)}`}
                    aria-hidden
                />
                {!isLast ? (
                    <span className="ml-1 mr-0 h-px min-w-[0.35rem] flex-1 bg-alloy-stone/15" aria-hidden />
                ) : null}
            </div>
            <span className={`text-center text-[9px] leading-tight tracking-wide ${stepLabelClass(slot.phase)}`}>
                {slot.label}
            </span>
        </li>
    );
}

/**
 * Compact horizontal lifecycle stepper (Option A).
 * Future: dedicated Lifecycle tab when operational modules ship (Option B).
 */
export default function PersonDrawerChildLifecycleRoadmap({ record }: { record: Record<string, unknown> }) {
    const profile = resolvePersonDrawerProfileFromRecord(record);
    if (!personDrawerShowsChildLifecycleSurface(profile)) {
        return null;
    }

    const slots = resolveChildLifecycleSlotStates(record);

    return (
        <div
            className="rounded-lg border border-alloy-stone/12 bg-alloy-stone/[0.02] px-2 py-2"
            data-person-drawer-child-lifecycle-roadmap="true"
            data-child-lifecycle-roadmap-ux={CHILD_LIFECYCLE_ROADMAP_UX}
        >
            <p className={oppInqEyebrow}>Lifecycle</p>
            <p className="mt-0.5 text-[10px] leading-snug text-alloy-midnight/40">
                Orientation only — activity rollups will appear here as modules ship.
            </p>
            <ol className="mt-2 flex w-full list-none items-start overflow-x-auto pb-0.5">
                {slots.map((slot, index) => (
                    <LifecycleStep key={slot.key} slot={slot} isLast={index === slots.length - 1} />
                ))}
            </ol>
        </div>
    );
}
