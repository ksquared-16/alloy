/**
 * Built-in queue layout variants (Phase 0) — curated defaults before DB publish.
 *
 * Used when no published entity_layouts row matches the request context.
 * Opportunities enrollment: pipeline case row + waitlist candidate row (canonical).
 */

import { buildEnrollmentWaitlistQueueDoc, buildLeadQueueDefaultDoc } from "./defaultLeadLayouts";
import type { LayoutDoc } from "./layoutV2";
import { queueContextDescriptorMatchesRequest, type QueueLayoutContextDescriptor } from "./queueLayoutContext";

export type BuiltinQueueLayoutVariant = {
    layoutKey: string;
    name: string;
    queueContext: QueueLayoutContextDescriptor;
    buildDoc: () => LayoutDoc;
};

export const ENROLLMENT_PIPELINE_CASE_QUEUE_CONTEXT: QueueLayoutContextDescriptor = {
    lifecycle_key: "enrollment",
    queue_type: "pipeline",
    grain: "case",
};

export const ENROLLMENT_WAITLIST_CANDIDATE_QUEUE_CONTEXT: QueueLayoutContextDescriptor = {
    lifecycle_key: "enrollment",
    queue_type: "waitlist",
    grain: "candidate",
};

/** Curated opportunity queue variants (deterministic; no DB required). */
export const OPPORTUNITY_BUILTIN_QUEUE_VARIANTS: BuiltinQueueLayoutVariant[] = [
    {
        layoutKey: "enrollment_pipeline_case_row",
        name: "Enrollment pipeline (case grain)",
        queueContext: ENROLLMENT_PIPELINE_CASE_QUEUE_CONTEXT,
        buildDoc: buildLeadQueueDefaultDoc,
    },
    {
        layoutKey: "enrollment_waitlist_candidate_row",
        name: "Enrollment waitlist (candidate grain)",
        queueContext: ENROLLMENT_WAITLIST_CANDIDATE_QUEUE_CONTEXT,
        buildDoc: buildEnrollmentWaitlistQueueDoc,
    },
];

export function listBuiltinQueueVariants(entityType: string): BuiltinQueueLayoutVariant[] {
    if (entityType === "opportunities") return OPPORTUNITY_BUILTIN_QUEUE_VARIANTS;
    return [];
}

export function resolveBuiltinQueueLayoutVariant(
    entityType: string,
    request: QueueLayoutContextDescriptor | undefined,
): { variant: BuiltinQueueLayoutVariant; doc: LayoutDoc } | null {
    const variants = listBuiltinQueueVariants(entityType);
    if (variants.length === 0) return null;

    const req = request ?? {};

    // Same tier precedence as DB resolution
    const tiers: Array<(v: BuiltinQueueLayoutVariant) => boolean> = [
        (v) => Boolean(v.queueContext.work_unit_key && v.queueContext.stage_key),
        (v) => Boolean(v.queueContext.stage_key) && !v.queueContext.work_unit_key,
        (v) => Boolean(v.queueContext.queue_type) && !v.queueContext.stage_key && !v.queueContext.work_unit_key,
        (v) =>
            Boolean(v.queueContext.lifecycle_key) &&
            !v.queueContext.queue_type &&
            !v.queueContext.stage_key &&
            !v.queueContext.work_unit_key,
        (v) =>
            !v.queueContext.lifecycle_key &&
            !v.queueContext.queue_type &&
            !v.queueContext.stage_key &&
            !v.queueContext.work_unit_key,
    ];

    for (const tierFilter of tiers) {
        for (const variant of variants) {
            if (!tierFilter(variant)) continue;
            if (!queueContextDescriptorMatchesRequest(variant.queueContext, req)) continue;
            return { variant, doc: variant.buildDoc() };
        }
    }

    // Fallback: any variant whose descriptor is a subset match
    for (const variant of variants) {
        if (queueContextDescriptorMatchesRequest(variant.queueContext, req)) {
            return { variant, doc: variant.buildDoc() };
        }
    }

    return null;
}
