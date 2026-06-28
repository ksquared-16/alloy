/**
 * Tiered staffing-threshold logic for childcare ratio rules.
 *
 * A ratio rule carries ordered tiers, e.g.:
 *   1 staff up to 5 children
 *   2 staff up to 11 children
 *   3 staff up to 16 children
 *
 * Pure functions only. These distinguish ratio-limited capacity (a config-derived
 * ceiling) from physical/licensed capacity (stored config) and from staffed
 * capacity (a future facts-derived value).
 */

import type { ChildcareRatioRuleTierRow } from "@/lib/childcareOperational/config/configRuleTypes";

export type RatioTier = Pick<ChildcareRatioRuleTierRow, "max_children" | "required_staff">;

export function sortRatioTiers<T extends RatioTier>(tiers: readonly T[]): T[] {
    return tiers.slice().sort((a, b) => a.max_children - b.max_children);
}

export type RequiredStaffResult = {
    requiredStaff: number;
    /** True when childCount exceeds the highest defined tier (over ratio-limited capacity). */
    exceedsDefinedTiers: boolean;
};

/**
 * Staff required to remain compliant for a given child count.
 * Returns the smallest tier whose max_children covers the count.
 */
export function requiredStaffForChildren(
    tiers: readonly RatioTier[],
    childCount: number
): RequiredStaffResult {
    if (childCount <= 0) return { requiredStaff: 0, exceedsDefinedTiers: false };

    const sorted = sortRatioTiers(tiers);
    if (sorted.length === 0) return { requiredStaff: 0, exceedsDefinedTiers: true };

    for (const tier of sorted) {
        if (childCount <= tier.max_children) {
            return { requiredStaff: tier.required_staff, exceedsDefinedTiers: false };
        }
    }

    // over the highest tier: report the top tier's staffing and flag the breach.
    const top = sorted[sorted.length - 1];
    return { requiredStaff: top.required_staff, exceedsDefinedTiers: true };
}

/** Ratio-limited capacity = the highest child count any tier permits. */
export function ratioLimitedCapacity(tiers: readonly RatioTier[]): number {
    if (tiers.length === 0) return 0;
    return sortRatioTiers(tiers).reduce((max, t) => Math.max(max, t.max_children), 0);
}

/** Highest child count a given staff count can cover under the tiers. */
export function maxChildrenForStaff(tiers: readonly RatioTier[], staffCount: number): number {
    if (staffCount <= 0) return 0;
    return sortRatioTiers(tiers)
        .filter((t) => t.required_staff <= staffCount)
        .reduce((max, t) => Math.max(max, t.max_children), 0);
}
