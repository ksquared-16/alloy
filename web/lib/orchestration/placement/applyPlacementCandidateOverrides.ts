import {
    PLACEMENT_OVERRIDE_UNPINNED_PRECEDENCE,
    parsePlacementOverridePayload,
} from "@/lib/orchestration/placement/placementOverridePayload";
import type { PlacementCandidateActiveOverrideSummary } from "@/lib/orchestration/placement/placementCandidateTypes";
import type {
    PlacementEvaluateOk,
    PlacementPrioritySnapshot,
    PlacementProfile,
} from "@/lib/orchestration/placement/placementPriorityTypes";

export type PlacementOverrideAppliedSummary = {
    override_id: string;
    override_kind: PlacementCandidateActiveOverrideSummary["override_kind"];
    reason: string;
    policy_bucket_key: string;
    effective_bucket_key: string;
    pin_ordinal?: number;
};

function bucketPriorityIndex(profile: PlacementProfile): number {
    return profile.primary_group_fact_key?.trim() ? 1 : 0;
}

function resolveBucketLabel(profile: PlacementProfile, bucketKey: string): string {
    const bucket = profile.buckets.find((b) => b.bucket_key === bucketKey);
    if (!bucket) return bucketKey;
    return profile.labels[bucket.label_key] ?? bucketKey;
}

function pickPinOverride(overrides: PlacementCandidateActiveOverrideSummary[]) {
    return overrides.find((o) => o.override_kind === "pin" || parsePlacementOverridePayload(o.payload).pin_ordinal != null);
}

function pickTierBoostOverride(overrides: PlacementCandidateActiveOverrideSummary[]) {
    return overrides.find(
        (o) =>
            o.override_kind === "tier_boost" ||
            (o.override_kind === "temporary" && parsePlacementOverridePayload(o.payload).effective_bucket_key)
    );
}

/**
 * The comparable manual-precedence value for a candidate: its `pin_ordinal` when a pin is in force,
 * otherwise {@link PLACEMENT_OVERRIDE_UNPINNED_PRECEDENCE}. Every candidate answers this — an
 * unpinned row is not "missing" a manual position, it has the lowest possible claim to one.
 */
export function manualPrecedenceOf(
    active_overrides: PlacementCandidateActiveOverrideSummary[]
): number {
    const pin = pickPinOverride(active_overrides);
    if (!pin) return PLACEMENT_OVERRIDE_UNPINNED_PRECEDENCE;
    const parsed = parsePlacementOverridePayload(pin.payload);
    return parsed.pin_ordinal ?? PLACEMENT_OVERRIDE_UNPINNED_PRECEDENCE;
}

/**
 * Merge active overrides into policy evaluation — policy snapshot preserved; effective tuple drives queue order.
 */
export function applyPlacementCandidateOverrides(params: {
    policy: PlacementEvaluateOk;
    profile: PlacementProfile;
    active_overrides: PlacementCandidateActiveOverrideSummary[];
}): {
    effective: PlacementPrioritySnapshot;
    policy_snapshot: PlacementPrioritySnapshot;
    applied: PlacementOverrideAppliedSummary[];
} {
    const policy_snapshot: PlacementPrioritySnapshot = { ...params.policy.snapshot, sort_tuple: [...params.policy.snapshot.sort_tuple] };
    const effective: PlacementPrioritySnapshot = { ...policy_snapshot, sort_tuple: [...policy_snapshot.sort_tuple] };
    const applied: PlacementOverrideAppliedSummary[] = [];

    if (!params.active_overrides.length) {
        return { effective, policy_snapshot, applied };
    }

    const tierOverride = pickTierBoostOverride(params.active_overrides);
    const bucketIdx = bucketPriorityIndex(params.profile);

    /*
     * ── A PIN IS A POSITION, NOT A PRECEDENCE SCORE ──
     *
     * This used to splice `pin_ordinal` into `sort_tuple` at `bucketIdx` — but ONLY for candidates
     * that had overrides. Unpinned candidates kept their natural tuple, so the comparison at that
     * index put `pin_ordinal` (1..999) against `bucket.priority_order`. Measured on deployed
     * staging: pinned tuple `["infant — 0–18 months", 2, 50, …]` vs unpinned `["infant — 0–18
     * months", 50, …]`. Two consequences, both wrong:
     *
     *   1. Comparing an ordinal to a bucket priority is a category error — the tuples were not even
     *      the same shape (6 elements vs 5).
     *   2. Every ordinal below the bucket priority collapsed to the same answer. Pinning to 2, 5 or
     *      12 produced an identical position, because all three are simply "< 50". The operator
     *      chose a position and the engine could only hear "ahead of the unpinned rows".
     *
     * The ordinal now stays OUT of the tuple. `sort_tuple` is the NATURAL order — the baseline a
     * pin is expressed against — and the pin is applied as a cohort-local placement by
     * `applyCohortLocalManualPositions` once that baseline is sorted. `applied[].pin_ordinal` below
     * still reports the ordinal, so nothing downstream loses the fact that a pin is in force.
     *
     * `PLACEMENT_OVERRIDE_UNPINNED_PRECEDENCE` is retained as the documented "no manual position"
     * sentinel for consumers that ask for a comparable manual precedence value
     * ({@link manualPrecedenceOf}).
     */

    let effectiveBucketKey = effective.bucket_key;
    if (tierOverride) {
        const parsed = parsePlacementOverridePayload(tierOverride.payload);
        if (parsed.effective_bucket_key) {
            const bucket = params.profile.buckets.find((b) => b.bucket_key === parsed.effective_bucket_key);
            if (bucket) {
                effectiveBucketKey = bucket.bucket_key;
                effective.bucket_key = bucket.bucket_key;
                effective.bucket_priority_order = bucket.priority_order;
                effective.bucket_label = resolveBucketLabel(params.profile, bucket.bucket_key);
                effective.sort_tuple[bucketIdx] = bucket.priority_order;
            }
        }
    }

    for (const o of params.active_overrides) {
        const parsed = parsePlacementOverridePayload(o.payload);
        applied.push({
            override_id: o.id,
            override_kind: o.override_kind,
            reason: o.reason,
            policy_bucket_key: policy_snapshot.bucket_key,
            effective_bucket_key: effectiveBucketKey,
            ...(parsed.pin_ordinal != null ? { pin_ordinal: parsed.pin_ordinal } : {}),
        });
    }

    return { effective, policy_snapshot, applied };
}
