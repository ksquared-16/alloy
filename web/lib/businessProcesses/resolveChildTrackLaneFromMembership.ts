/**
 * Metadata-driven child-track queue lane from builder queue_membership_v1.
 */

import type {
    QueueMembershipCountUnit,
    QueueMembershipLocationScopeSource,
    QueueMembershipV1,
} from "@/lib/lifecycle/queueMembershipV1";
import { resolveEffectiveLocationScopeSource } from "@/lib/queues/queueMembershipLocationScope";

export type ProcessChildTrackLaneContext = {
    enabled: true;
    queueKey: string;
    stageKey: string;
    stageLabel: string;
    dispositionKeys: readonly string[];
    countUnit?: QueueMembershipCountUnit;
    membershipSource?: "builder" | "child_grain_flag";
    locationScopeSource?: QueueMembershipLocationScopeSource | null;
};

function trimOrNull(raw: unknown): string | null {
    if (raw == null) return null;
    const t = String(raw).trim();
    return t || null;
}

function dispositionKeysFromMembership(membership: QueueMembershipV1): readonly string[] {
    return membership.included_disposition_keys.map((k) => k.trim()).filter(Boolean);
}

/** Build child-track lane context from explicit builder membership (no enrollment constants). */
export function buildChildTrackLaneFromMembership(params: {
    executableQueueKey: string;
    membership: QueueMembershipV1;
    stageLabel?: string | null;
}): ProcessChildTrackLaneContext | null {
    if (params.membership.subject_type !== "child") return null;
    const stageKey = trimOrNull(params.membership.stage_key);
    if (!stageKey) return null;

    const dispositionKeys = dispositionKeysFromMembership(params.membership);
    if (!dispositionKeys.length) return null;

    return {
        enabled: true,
        queueKey: params.executableQueueKey.trim(),
        stageKey,
        stageLabel: trimOrNull(params.stageLabel) ?? stageKey,
        dispositionKeys,
        countUnit: params.membership.count_unit,
        membershipSource: "builder",
        locationScopeSource: resolveEffectiveLocationScopeSource(params.membership),
    };
}
