import type { PlacementProfile } from "@/lib/orchestration/placement/placementPriorityTypes";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfile";

/** Default bucket evaluation / sort tier order for childcare enrollment waitlist V1 (fallback must stay last). */
export const CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1: readonly string[] = [
    "tier_staff_community",
    "tier_sibling_enrolled",
    "tier_sister_center",
    "tier_general_waitlist",
] as const;

/** Operator-facing labels — one line per reorderable tier (community is evaluated with staff in this preset). */
export const CHILDCARE_PRIORITY_RULE_ORDER_LABELS_V1: Record<string, string> = {
    tier_staff_community: "Employee, staff, or community priority",
    tier_sibling_enrolled: "Sibling enrolled at center",
    tier_sister_center: "Sister center transfer",
    tier_general_waitlist: "Standard family (no higher rule matched)",
};

export function defaultPriorityRuleOrderForProfileId(profileId: string): string[] | null {
    if (profileId.trim() === CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1.profile_id) {
        return [...CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1];
    }
    return null;
}

export type ValidatePriorityRuleOrderResult = { ok: true } | { ok: false; error: string };

/**
 * Validates `priority_rule_order` for a concrete preset: full permutation of profile buckets,
 * no duplicates, last entry must be `fallback_bucket_key`.
 */
export function validatePriorityRuleOrderForProfile(profile: PlacementProfile, order: string[]): ValidatePriorityRuleOrderResult {
    const expected = new Set(profile.buckets.map((b) => b.bucket_key));
    if (order.length !== expected.size) {
        return {
            ok: false,
            error: `priority_rule_order must list each bucket exactly once (${expected.size} entries for this profile).`,
        };
    }
    const seen = new Set<string>();
    for (const k of order) {
        const key = typeof k === "string" ? k.trim() : "";
        if (!key) {
            return { ok: false, error: "priority_rule_order entries must be non-empty strings." };
        }
        if (!expected.has(key)) {
            return { ok: false, error: `Unknown priority_rule_order bucket "${key}" for this profile.` };
        }
        if (seen.has(key)) {
            return { ok: false, error: `Duplicate bucket "${key}" in priority_rule_order.` };
        }
        seen.add(key);
    }
    const last = order[order.length - 1]!.trim();
    if (last !== profile.fallback_bucket_key) {
        return {
            ok: false,
            error: `The last priority_rule_order entry must be the standard fallback bucket "${profile.fallback_bucket_key}".`,
        };
    }
    return { ok: true };
}

/**
 * Builds an **ephemeral** profile for this work unit: re-weights buckets and re-orders rules so
 * tier precedence matches `priority_rule_order` without mutating registry presets.
 */
export function applyPriorityRuleOrderToProfile(profile: PlacementProfile, order: string[]): PlacementProfile {
    const v = validatePriorityRuleOrderForProfile(profile, order);
    if (!v.ok) {
        throw new Error(v.error);
    }
    const bucketMap = new Map(profile.buckets.map((b) => [b.bucket_key, b]));
    const reorderedBuckets = order.map((key, i) => {
        const b = bucketMap.get(key)!;
        return { ...b, priority_order: (i + 1) * 10 };
    });
    const orderIndex = new Map(order.map((k, i) => [k, i]));
    const sortedRules = [...profile.rules].sort((a, b) => {
        const ia = orderIndex.get(a.assign_bucket_key) ?? 999;
        const ib = orderIndex.get(b.assign_bucket_key) ?? 999;
        if (ia !== ib) return ia - ib;
        return a.rule_order - b.rule_order;
    });
    const renumberedRules = sortedRules.map((r, i) => ({ ...r, rule_order: (i + 1) * 10 }));
    return {
        ...profile,
        buckets: reorderedBuckets,
        rules: renumberedRules,
    };
}

/** Swap with previous tier — `null` when move is not allowed (standard stays last). */
export function reorderPriorityRuleMoveUp(order: readonly string[], index: number, fallbackLast: string): string[] | null {
    if (index <= 0 || index >= order.length) return null;
    if (order[order.length - 1] !== fallbackLast) return null;
    if (index === order.length - 1) return null;
    const next = [...order];
    [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
    if (next[next.length - 1] !== fallbackLast) return null;
    return next;
}

/** Swap with next tier — `null` when move would displace the standard fallback from the end. */
export function reorderPriorityRuleMoveDown(order: readonly string[], index: number, fallbackLast: string): string[] | null {
    if (index < 0 || index >= order.length - 1) return null;
    if (order[order.length - 1] !== fallbackLast) return null;
    if (index === order.length - 2) return null;
    const next = [...order];
    [next[index], next[index + 1]] = [next[index + 1]!, next[index]!];
    if (next[next.length - 1] !== fallbackLast) return null;
    return next;
}
