/**
 * Capacity resolution over childcare_capacity_rules.
 *
 * Distinguishes the stored capacity kinds (physical / licensed / operational) and
 * exposes the binding (most-restrictive) seat limit. Ratio-limited capacity is
 * supplied separately (derived from ratio tiers); staffed capacity is a future
 * facts-derived value and is intentionally not computed here.
 *
 * Pure functions only.
 */

import { resolveConfigRule } from "@/lib/childcareOperational/config/resolveConfigRule";
import type {
    CapacityKind,
    ChildcareCapacityRuleRow,
    ConfigRuleScopeContext,
} from "@/lib/childcareOperational/config/configRuleTypes";

/** Resolve the seat limit for one capacity kind, most-specific-wins. */
export function resolveCapacity(
    rules: readonly ChildcareCapacityRuleRow[],
    context: ConfigRuleScopeContext,
    dateYmd: string,
    kind: CapacityKind
): number | null {
    const ofKind = rules.filter((r) => r.capacity_kind === kind);
    const winner = resolveConfigRule<ChildcareCapacityRuleRow>(ofKind, context, dateYmd);
    return winner ? winner.capacity : null;
}

export type ResolvedCapacityBreakdown = {
    physical: number | null;
    licensed: number | null;
    operational: number | null;
    /** Supplied by the caller from ratio tiers (config-derived), not stored. */
    ratioLimited: number | null;
    /** Most-restrictive of the defined limits; null when none defined. */
    binding: number | null;
};

/** Resolve all stored capacity kinds plus an optional ratio-limited ceiling. */
export function resolveCapacityBreakdown(
    rules: readonly ChildcareCapacityRuleRow[],
    context: ConfigRuleScopeContext,
    dateYmd: string,
    ratioLimited: number | null = null
): ResolvedCapacityBreakdown {
    const physical = resolveCapacity(rules, context, dateYmd, "physical");
    const licensed = resolveCapacity(rules, context, dateYmd, "licensed");
    const operational = resolveCapacity(rules, context, dateYmd, "operational");

    const candidates = [physical, licensed, operational, ratioLimited].filter(
        (v): v is number => v != null
    );
    const binding = candidates.length > 0 ? Math.min(...candidates) : null;

    return { physical, licensed, operational, ratioLimited, binding };
}
