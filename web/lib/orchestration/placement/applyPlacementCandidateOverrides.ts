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

    const pinOverride = pickPinOverride(params.active_overrides);
    const tierOverride = pickTierBoostOverride(params.active_overrides);
    const bucketIdx = bucketPriorityIndex(params.profile);

    let pinOrdinal: number | undefined;
    if (pinOverride) {
        const parsed = parsePlacementOverridePayload(pinOverride.payload);
        if (parsed.pin_ordinal != null) pinOrdinal = parsed.pin_ordinal;
    }

    const manualPrecedence = pinOrdinal ?? PLACEMENT_OVERRIDE_UNPINNED_PRECEDENCE;
    effective.sort_tuple.splice(bucketIdx, 0, manualPrecedence);

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
                effective.sort_tuple[bucketIdx + 1] = bucket.priority_order;
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
