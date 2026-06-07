/**
 * Queue layout variant resolution — Layout Contract V1 §3.4.3.
 *
 * Pure function: given candidate published records and a request context,
 * returns the most specific matching record per contract precedence:
 *
 *   work_unit_key + stage_key → stage_key → queue_type → lifecycle_key → default
 */

import type { EntityLayoutRecord } from "./layoutV2";
import {
    extractQueueContextFromRecord,
    isQueueLayoutContextEmpty,
    queueContextDescriptorMatchesRequest,
    type QueueLayoutContextDescriptor,
    type QueueLayoutContextRequest,
} from "./queueLayoutContext";

export type QueueVariantMatchTier =
    | "work_unit_and_stage"
    | "stage"
    | "queue_type"
    | "lifecycle"
    | "default"
    | "none";

export type QueueLayoutVariantMatch = {
    record: EntityLayoutRecord;
    tier: QueueVariantMatchTier;
    descriptor: QueueLayoutContextDescriptor;
};

const TIER_RANK: Record<QueueVariantMatchTier, number> = {
    work_unit_and_stage: 5,
    stage: 4,
    queue_type: 3,
    lifecycle: 2,
    default: 1,
    none: 0,
};

function classifyDescriptorTier(descriptor: QueueLayoutContextDescriptor): QueueVariantMatchTier {
    if (isQueueLayoutContextEmpty(descriptor)) return "default";
    const hasWorkUnit = Boolean(descriptor.work_unit_key);
    const hasStage = Boolean(descriptor.stage_key);
    const hasQueueType = Boolean(descriptor.queue_type);
    const hasLifecycle = Boolean(descriptor.lifecycle_key);

    if (hasWorkUnit && hasStage) return "work_unit_and_stage";
    if (hasStage && !hasWorkUnit) return "stage";
    if (hasQueueType && !hasStage && !hasWorkUnit) return "queue_type";
    if (hasLifecycle && !hasQueueType && !hasStage && !hasWorkUnit) return "lifecycle";
    // Mixed descriptors: rank by highest present specificity
    if (hasWorkUnit && hasStage) return "work_unit_and_stage";
    if (hasStage) return "stage";
    if (hasQueueType) return "queue_type";
    if (hasLifecycle) return "lifecycle";
    return "default";
}

function latestPublishedVersion(records: EntityLayoutRecord[]): EntityLayoutRecord | null {
    if (records.length === 0) return null;
    return [...records].sort((a, b) => b.version - a.version)[0] ?? null;
}

function publishedRecords(records: EntityLayoutRecord[] | undefined, surface: "queue"): EntityLayoutRecord[] {
    return (records ?? []).filter((r) => r.status === "published" && r.surface === surface);
}

/**
 * Find the best matching published queue layout record for a request context.
 * Returns null when no candidate matches at any tier (caller falls back to builtin/registry).
 */
export function matchQueueLayoutVariant(
    records: EntityLayoutRecord[],
    request: QueueLayoutContextRequest | undefined,
): QueueLayoutVariantMatch | null {
    const published = publishedRecords(records, "queue");
    if (published.length === 0) return null;

    const req = request ?? {};
    const matching: QueueLayoutVariantMatch[] = [];

    for (const record of published) {
        const descriptor = extractQueueContextFromRecord(record);
        if (!queueContextDescriptorMatchesRequest(descriptor, req)) continue;
        matching.push({
            record,
            tier: classifyDescriptorTier(descriptor),
            descriptor,
        });
    }

    if (matching.length === 0) return null;

    matching.sort((a, b) => {
        const tierDiff = TIER_RANK[b.tier] - TIER_RANK[a.tier];
        if (tierDiff !== 0) return tierDiff;
        return b.record.version - a.record.version;
    });

    return matching[0] ?? null;
}

/**
 * Contract precedence cascade: try tiers in order using request keys present.
 * Picks the best published match at the highest applicable tier.
 */
export function resolveQueueLayoutVariantFromRecords(
    orgRecords: EntityLayoutRecord[] | undefined,
    defaultRecords: EntityLayoutRecord[] | undefined,
    request: QueueLayoutContextRequest | undefined,
): QueueLayoutVariantMatch | null {
    const combined = [...publishedRecords(orgRecords, "queue"), ...publishedRecords(defaultRecords, "queue")];

    const req = request ?? {};

    const tiers: Array<{ tier: QueueVariantMatchTier; filter: (d: QueueLayoutContextDescriptor) => boolean }> = [
        {
            tier: "work_unit_and_stage",
            filter: (d) => Boolean(d.work_unit_key && d.stage_key),
        },
        {
            tier: "stage",
            filter: (d) => Boolean(d.stage_key) && !d.work_unit_key,
        },
        {
            tier: "queue_type",
            filter: (d) => Boolean(d.queue_type) && !d.stage_key && !d.work_unit_key,
        },
        {
            tier: "lifecycle",
            filter: (d) =>
                Boolean(d.lifecycle_key) && !d.queue_type && !d.stage_key && !d.work_unit_key,
        },
        {
            tier: "default",
            filter: (d) => isQueueLayoutContextEmpty(d),
        },
    ];

    for (const { tier, filter } of tiers) {
        const requiresRequestKey =
            tier === "work_unit_and_stage"
                ? req.work_unit_key && req.stage_key
                : tier === "stage"
                  ? req.stage_key
                  : tier === "queue_type"
                    ? req.queue_type
                    : tier === "lifecycle"
                      ? req.lifecycle_key
                      : true;

        if (!requiresRequestKey && tier !== "default") continue;

        const tierRecords = combined.filter((r) => {
            const d = extractQueueContextFromRecord(r);
            return filter(d) && queueContextDescriptorMatchesRequest(d, req);
        });

        const best = latestPublishedVersion(tierRecords);
        if (best) {
            return {
                record: best,
                tier,
                descriptor: extractQueueContextFromRecord(best),
            };
        }
    }

    return matchQueueLayoutVariant(combined, request);
}
