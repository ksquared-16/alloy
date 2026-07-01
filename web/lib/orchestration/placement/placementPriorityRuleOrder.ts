import type { PlacementProfile } from "@/lib/orchestration/placement/placementPriorityTypes";
import {
    TIER_EMPLOYEE_FAMILY_BUCKET,
    TIER_GENERAL_WAITLIST_BUCKET,
    TIER_STAFF_COMMUNITY_LEGACY_BUCKET,
} from "@/lib/orchestration/placement/placementBucketLabels";
import {
    CHILDCARE_ENROLLMENT_WAITLIST_OPERATOR_FACTOR_ORDER,
    CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1,
} from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfile";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfileV2";
import { getPlacementProfileFromRegistry } from "@/lib/orchestration/placement/placementPresetRegistry";

/** Operator-configurable factor order (settings UI + ranking QA defaults). */
export const CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1: readonly string[] =
    CHILDCARE_ENROLLMENT_WAITLIST_OPERATOR_FACTOR_ORDER;

/** @deprecated Use {@link CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1}. */
export const CHILDCARE_ENROLLMENT_WAITLIST_OPERATOR_PRIORITY_RULE_ORDER =
    CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1;

/** Operator-facing labels — one line per reorderable tier (community is evaluated with staff in this preset). */
export const CHILDCARE_PRIORITY_RULE_ORDER_LABELS_V1: Record<string, string> = {
    [TIER_EMPLOYEE_FAMILY_BUCKET]: "Employee families",
    tier_sibling_enrolled: "Sibling enrolled at center",
    tier_sister_center: "Sister center transfer",
    [TIER_GENERAL_WAITLIST_BUCKET]: "Standard family (no higher rule matched)",
};

export function migrateLegacyPriorityBucketKey(bucketKey: string): string {
    const k = bucketKey.trim();
    if (k === TIER_STAFF_COMMUNITY_LEGACY_BUCKET) return TIER_EMPLOYEE_FAMILY_BUCKET;
    return k;
}

export function fullDefaultPriorityRuleOrderForProfile(profile: PlacementProfile): string[] {
    return [...profile.buckets]
        .sort((a, b) => a.priority_order - b.priority_order)
        .map((b) => b.bucket_key);
}

/** Normalize saved metadata order: legacy keys, missing deferred buckets, fallback last. */
export function normalizePriorityRuleOrderForProfile(
    profile: PlacementProfile,
    order: readonly string[]
): string[] {
    const expectedOrder = fullDefaultPriorityRuleOrderForProfile(profile);
    const expected = new Set(expectedOrder);
    const seen = new Set<string>();
    const merged: string[] = [];

    for (const raw of order) {
        const k = migrateLegacyPriorityBucketKey(typeof raw === "string" ? raw : "");
        if (!k || !expected.has(k) || seen.has(k)) continue;
        seen.add(k);
        merged.push(k);
    }
    for (const k of expectedOrder) {
        if (!seen.has(k)) merged.push(k);
    }

    const fb = profile.fallback_bucket_key;
    const withoutFallback = merged.filter((k) => k !== fb);
    return [...withoutFallback, fb];
}

export function operatorPriorityRuleOrderFromFullOrder(
    fullOrder: readonly string[],
    operatorKeys: readonly string[] = CHILDCARE_ENROLLMENT_WAITLIST_OPERATOR_FACTOR_ORDER
): string[] {
    const op = new Set(operatorKeys);
    return fullOrder.filter((k) => op.has(k));
}

/** Default enabled tiers when metadata omits `priority_rule_enabled_keys` — operator factors only. */
export function resolveDefaultPriorityRuleEnabledKeysForOrder(
    order: readonly string[],
    operatorKeys: readonly string[] = CHILDCARE_ENROLLMENT_WAITLIST_OPERATOR_FACTOR_ORDER
): string[] | undefined {
    const operatorOrder = operatorPriorityRuleOrderFromFullOrder(order, operatorKeys);
    return operatorOrder.length > 0 ? operatorOrder : undefined;
}

/** Expand operator factor order into full profile bucket order (inserts deferred tiers). */
export function expandOperatorPriorityRuleOrderForProfile(
    profile: PlacementProfile,
    operatorOrder: readonly string[]
): string[] {
    const fullDefault = fullDefaultPriorityRuleOrderForProfile(profile);
    const opSet = new Set<string>(CHILDCARE_ENROLLMENT_WAITLIST_OPERATOR_FACTOR_ORDER);
    const deferred = fullDefault.filter((k) => !opSet.has(k));
    const fb = profile.fallback_bucket_key;

    const seen = new Set<string>();
    const core: string[] = [];
    for (const raw of operatorOrder) {
        const k = migrateLegacyPriorityBucketKey(raw);
        if (!k || k === fb || !opSet.has(k) || seen.has(k)) continue;
        seen.add(k);
        core.push(k);
    }
    for (const k of CHILDCARE_ENROLLMENT_WAITLIST_OPERATOR_FACTOR_ORDER) {
        if (k === fb || seen.has(k)) continue;
        core.push(k);
        seen.add(k);
    }

    const out = [...core];
    for (const d of deferred) {
        if (seen.has(d)) continue;
        const empIdx = out.indexOf(TIER_EMPLOYEE_FAMILY_BUCKET);
        const at = empIdx >= 0 ? empIdx + 1 : out.length;
        out.splice(at, 0, d);
        seen.add(d);
    }

    return [...out.filter((k) => k !== fb), fb];
}

export function normalizePriorityRuleEnabledKeysForProfile(
    profile: PlacementProfile,
    fullOrder: readonly string[],
    enabledKeys: readonly string[] | null | undefined
): string[] | undefined {
    if (!enabledKeys?.length) return enabledKeys ? [] : undefined;
    const orderSet = new Set(fullOrder.map((k) => k.trim()));
    const out = new Set<string>();
    for (const raw of enabledKeys) {
        const k = migrateLegacyPriorityBucketKey(typeof raw === "string" ? raw : "");
        if (k && orderSet.has(k)) out.add(k);
    }
    out.add(profile.fallback_bucket_key);
    return fullOrder.filter((k) => out.has(k));
}

export function defaultPriorityRuleOrderForProfileId(profileId: string): string[] | null {
    const id = profileId.trim();
    if (
        id === CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1.profile_id ||
        id === CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2.profile_id
    ) {
        return [...CHILDCARE_ENROLLMENT_WAITLIST_OPERATOR_FACTOR_ORDER];
    }
    const profile = getPlacementProfileFromRegistry(id);
    if (!profile) return null;
    return operatorPriorityRuleOrderFromFullOrder(fullDefaultPriorityRuleOrderForProfile(profile));
}

export function defaultFullPriorityRuleOrderForProfileId(profileId: string): string[] | null {
    const profile = getPlacementProfileFromRegistry(profileId.trim());
    if (!profile) return null;
    return fullDefaultPriorityRuleOrderForProfile(profile);
}

/** Stable array for metadata: keys in `order` that appear in `enabled`. */
export function sortPriorityRuleEnabledKeysForSave(enabled: ReadonlySet<string>, order: readonly string[]): string[] {
    return order.filter((k) => enabled.has(k));
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

/** When `enabledKeys` omitted or empty, all tiers in `order` are active. Fallback is always forced on. */
export function effectivePriorityRuleEnabledSet(
    order: readonly string[],
    enabledKeys: readonly string[] | null | undefined,
    fallbackKey: string
): Set<string> {
    const fb = fallbackKey.trim();
    if (!enabledKeys?.length) {
        return new Set(order.map((k) => k.trim()).filter(Boolean));
    }
    const s = new Set<string>();
    for (const k of enabledKeys) {
        const t = typeof k === "string" ? k.trim() : "";
        if (t) s.add(t);
    }
    s.add(fb);
    const orderSet = new Set(order.map((k) => k.trim()));
    return new Set([...s].filter((k) => orderSet.has(k)));
}

export type ValidatePriorityRuleEnabledKeysResult = { ok: true } | { ok: false; error: string };

export function validatePriorityRuleEnabledKeysForProfile(
    profile: PlacementProfile,
    order: readonly string[],
    enabled: ReadonlySet<string>
): ValidatePriorityRuleEnabledKeysResult {
    const expected = new Set(profile.buckets.map((b) => b.bucket_key));
    const orderSet = new Set(order.map((k) => k.trim()));
    if (!enabled.has(profile.fallback_bucket_key)) {
        return { ok: false, error: "priority_rule_enabled_keys must include the standard fallback bucket." };
    }
    const seen = new Set<string>();
    for (const k of enabled) {
        if (!expected.has(k)) {
            return { ok: false, error: `Unknown bucket in priority_rule_enabled_keys: "${k}".` };
        }
        if (!orderSet.has(k)) {
            return { ok: false, error: `priority_rule_enabled_keys entry "${k}" is not listed in priority_rule_order.` };
        }
        if (seen.has(k)) {
            return { ok: false, error: `Duplicate bucket in priority_rule_enabled_keys: "${k}".` };
        }
        seen.add(k);
    }
    return { ok: true };
}

/**
 * Applies `priority_rule_order` and **filters rules** to `priority_rule_enabled_keys` (inactive tiers never match).
 * Registry preset is not mutated.
 */
export function applyPlacementPriorityEffectiveProfile(
    profile: PlacementProfile,
    order: string[],
    enabledKeys: readonly string[] | null | undefined
): PlacementProfile {
    const ordered = applyPriorityRuleOrderToProfile(profile, order);
    const enabled = effectivePriorityRuleEnabledSet(
        order,
        enabledKeys ?? resolveDefaultPriorityRuleEnabledKeysForOrder(order),
        profile.fallback_bucket_key
    );
    const ve = validatePriorityRuleEnabledKeysForProfile(profile, order, enabled);
    if (!ve.ok) throw new Error(ve.error);

    const filteredRules = ordered.rules.filter((r) => enabled.has(r.assign_bucket_key));
    const renumbered = filteredRules.map((r, i) => ({ ...r, rule_order: (i + 1) * 10 }));
    return {
        ...ordered,
        rules: renumbered,
    };
}

/** Swap with previous **enabled** (non-fallback) tier in `order`. */
export function reorderPriorityRuleMoveUpEnabled(
    order: readonly string[],
    enabled: ReadonlySet<string>,
    fallbackLast: string,
    index: number
): string[] | null {
    if (index <= 0 || index >= order.length) return null;
    if (order[order.length - 1] !== fallbackLast) return null;
    const key = order[index]!;
    if (key === fallbackLast || !enabled.has(key)) return null;
    for (let j = index - 1; j >= 0; j--) {
        const k = order[j]!;
        if (k === fallbackLast || !enabled.has(k)) continue;
        const next = [...order];
        [next[j], next[index]] = [next[index]!, next[j]!];
        if (next[next.length - 1] !== fallbackLast) return null;
        return next;
    }
    return null;
}

/** Swap with next **enabled** (non-fallback) tier in `order`. */
export function reorderPriorityRuleMoveDownEnabled(
    order: readonly string[],
    enabled: ReadonlySet<string>,
    fallbackLast: string,
    index: number
): string[] | null {
    if (index < 0 || index >= order.length - 1) return null;
    if (order[order.length - 1] !== fallbackLast) return null;
    const key = order[index]!;
    if (key === fallbackLast || !enabled.has(key)) return null;
    for (let j = index + 1; j < order.length; j++) {
        const k = order[j]!;
        if (k === fallbackLast || !enabled.has(k)) continue;
        const next = [...order];
        [next[j], next[index]] = [next[index]!, next[j]!];
        if (next[next.length - 1] !== fallbackLast) return null;
        return next;
    }
    return null;
}
