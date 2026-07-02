/**
 * Queue Row — unified grain + conditions model (Presentation Runtime V3).
 *
 * Retires the "Pipeline Queue Row vs Waitlist Queue Row" two-mental-model split.
 * There is ONE Queue Row. It has a GRAIN and CONDITIONS:
 *
 *     Queue Row → Grain (Family/case | Child/candidate) → Conditions → Blocks
 *
 * Waitlist is NOT a separate surface — it is a CONDITION. Placement/waitlist
 * fields are conditional composition items that appear only where the persisted
 * source supports them, e.g. `placement_status = waitlisted`.
 *
 * Pure + framework-free (unit-testable). The full collapse of the two surface
 * catalog entries + the two API surfaces into one is staged; this model is the
 * canonical contract they converge on.
 *
 * @see docs/platform/operator/operational-grain-doctrine.md
 * @see queueRecordLayoutV3.ts (LayoutCondition on columns + fields)
 */

import type { LayoutCondition } from "@/lib/layout/layoutV2";

/** The two operator-facing grains for a queue row. */
export type QueueGrain = "family" | "child";

/** Operator-facing label per grain. */
export function grainLabel(grain: QueueGrain): string {
    return grain === "child" ? "Child / candidate" : "Family / case";
}

/**
 * Bridge during migration: today the surface id encodes grain. Map it to the
 * unified grain so one builder can drive both while the catalog is collapsed.
 */
export function grainForSurfaceId(surfaceId: string): QueueGrain {
    return surfaceId === "waitlist-queue-row" ? "child" : "family";
}

/** The canonical "is this candidate waitlisted?" condition. */
export const WAITLISTED_CONDITION: LayoutCondition = {
    type: "equals",
    path: "placement_status",
    value: "waitlisted",
};

/**
 * One conditional placement/waitlist composition item. `requiresPersistedSource`
 * marks fields that must only be offered where a real persisted source exists —
 * the builder must not surface a field with no backing (no fake fields).
 */
export type ConditionalPlacementField = {
    fieldKey: string;
    label: string;
    /** Shown only when this condition holds (placement_status = waitlisted). */
    visibleWhen: LayoutCondition;
    /** True only if a real persisted source backs this field. */
    requiresPersistedSource: boolean;
    /** Whether a persisted source currently exists (gates availability). */
    hasPersistedSource: boolean;
};

/**
 * Placement/waitlist fields, expressed as CONDITIONAL composition items (visible
 * only when waitlisted). Only fields with a real persisted source are offered —
 * `placement override` is included only when persistence exists.
 *
 * These keys match `defaultWaitlistQueueLayoutV3()` / `QUEUE_FIELD_CATALOG`.
 */
export function waitlistConditionalFields(opts: { placementOverridePersisted?: boolean } = {}): ConditionalPlacementField[] {
    const base: ConditionalPlacementField[] = [
        { fieldKey: "waitlist.positionLabel", label: "Waitlist Position", visibleWhen: WAITLISTED_CONDITION, requiresPersistedSource: true, hasPersistedSource: true },
        { fieldKey: "waitlist.tierLabel", label: "Priority Tier", visibleWhen: WAITLISTED_CONDITION, requiresPersistedSource: true, hasPersistedSource: true },
        { fieldKey: "waitlist.waitSince", label: "Wait Since", visibleWhen: WAITLISTED_CONDITION, requiresPersistedSource: true, hasPersistedSource: true },
        { fieldKey: "inquiry_child.schedule_type", label: "Desired Schedule", visibleWhen: WAITLISTED_CONDITION, requiresPersistedSource: true, hasPersistedSource: true },
        { fieldKey: "inquiry_child.program", label: "Desired Program", visibleWhen: WAITLISTED_CONDITION, requiresPersistedSource: true, hasPersistedSource: true },
        // Placement override only exists where a real persisted override source is present.
        { fieldKey: "overrides.flags", label: "Placement Override", visibleWhen: WAITLISTED_CONDITION, requiresPersistedSource: true, hasPersistedSource: Boolean(opts.placementOverridePersisted) },
    ];
    return base;
}

/**
 * The availability rule (no fake fields): a conditional placement field is
 * offered ONLY when a persisted source backs it.
 */
export function availableWaitlistFields(opts: { placementOverridePersisted?: boolean } = {}): ConditionalPlacementField[] {
    return waitlistConditionalFields(opts).filter((f) => !f.requiresPersistedSource || f.hasPersistedSource);
}

/** Whether waitlist/placement fields are relevant for a grain (child/candidate). */
export function grainSupportsWaitlist(grain: QueueGrain): boolean {
    return grain === "child";
}
