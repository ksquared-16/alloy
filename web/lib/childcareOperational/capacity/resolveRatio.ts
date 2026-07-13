/**
 * Canonical Ratio resolver (Phase A, A6).
 *
 * Formalizes the existing stepped-tier ratio engine behind one resolver, adding
 * the extensible mixed-age policy. It does NOT rebuild the tier math — it wraps
 * the pure functions in `ratioRules.ts` and the precedence in `resolveConfigRule`.
 *
 * Stepped tiers are honored exactly (1 adult → max 5, 2 adults → max 11); the
 * engine never decimal-scales. Mixed-age rooms reconcile via `most_restrictive`
 * (the only Phase-A policy); `weighted` / `explicit_room_designation` are future
 * adapters and throw if requested. Uncovered age groups surface as `incomplete`
 * with a warning — never silently dropped or treated as fitting safely.
 *
 * Pure: no DB, no IO. The Capacity resolver (A5) composes this.
 */

import {
    maxChildrenForStaff,
    ratioLimitedCapacity,
    requiredStaffForChildren,
    type RatioTier,
} from "@/lib/childcareOperational/config/ratioRules";
import { resolveConfigRule } from "@/lib/childcareOperational/config/resolveConfigRule";
import type {
    ChildcareRatioRuleRow,
    ChildcareRatioRuleTierRow,
    ConfigRuleScopeContext,
} from "@/lib/childcareOperational/config/configRuleTypes";
import {
    DEFAULT_MIXED_AGE_RATIO_POLICY,
    type ResolveRatioRequest,
    type ResolvedRatio,
} from "@/lib/childcareOperational/capacity/capacityContractTypes";
import type {
    AppliedOperationalRule,
    OperationalResolutionStatus,
    OperationalResolutionWarning,
} from "@/lib/location/operationalResolutionContracts";
import { sortAppliedRules, sortWarnings } from "@/lib/location/operationalResolutionContracts";

/** Config subset the ratio resolver reads (a slice of ChildcareConfigRuleBundle). */
export type RatioConfig = {
    ratioRules: readonly ChildcareRatioRuleRow[];
    ratioRuleTiers: readonly ChildcareRatioRuleTierRow[];
};

function tiersByRuleId(tiers: readonly ChildcareRatioRuleTierRow[]): Map<string, RatioTier[]> {
    const map = new Map<string, RatioTier[]>();
    for (const tier of tiers) {
        const list = map.get(tier.ratio_rule_id) ?? [];
        list.push({ max_children: tier.max_children, required_staff: tier.required_staff });
        map.set(tier.ratio_rule_id, list);
    }
    return map;
}

function scopeIdOf(rule: ChildcareRatioRuleRow): string | undefined {
    switch (rule.scope_type) {
        case "site":
            return rule.site_location_id ?? undefined;
        case "program":
            return rule.program_category_id ?? undefined;
        case "room":
            return rule.room_location_id ?? undefined;
        default:
            return undefined;
    }
}

function appliedRuleOf(rule: ChildcareRatioRuleRow, binding: boolean): AppliedOperationalRule {
    return {
        ruleId: rule.id,
        ruleType: "ratio",
        scopeType: rule.scope_type,
        scopeId: scopeIdOf(rule),
        effectiveStart: rule.effective_start,
        effectiveEnd: rule.effective_end ?? undefined,
        sourceKey: rule.source_key,
        binding,
    };
}

/** One age group's resolved ratio rule + its evaluated tiers. */
export type ApplicableRatioRule = {
    ageGroupKey: string | null;
    rule: ChildcareRatioRuleRow;
    tiers: RatioTier[];
    /** Highest child count the tiers permit (ratio-limited ceiling). */
    ratioConstrainedCapacity: number;
};

/**
 * Resolve the applicable ratio rule for each age group in the context (single
 * `ageGroupKey`, or every group in `ageGroupContext`). Uncovered groups are
 * returned separately so callers never lose them.
 */
export function resolveApplicableRatioRules(
    config: RatioConfig,
    request: ResolveRatioRequest
): { applicable: ApplicableRatioRule[]; uncoveredAgeGroups: (string | null)[] } {
    const tierMap = tiersByRuleId(config.ratioRuleTiers);
    const ageGroups: (string | null)[] =
        request.ageGroupContext && request.ageGroupContext.length > 0
            ? [...new Set(request.ageGroupContext)]
            : [request.ageGroupKey ?? null];

    const applicable: ApplicableRatioRule[] = [];
    const uncoveredAgeGroups: (string | null)[] = [];

    for (const ageGroupKey of ageGroups) {
        const context: ConfigRuleScopeContext = {
            siteLocationId: request.siteLocationId ?? null,
            programCategoryId: request.programCategoryId ?? null,
            roomLocationId: request.roomLocationId ?? null,
            ageGroupKey,
        };
        const rule = resolveConfigRule(config.ratioRules, context, request.effectiveAt);
        if (!rule) {
            uncoveredAgeGroups.push(ageGroupKey);
            continue;
        }
        const tiers = tierMap.get(rule.id) ?? [];
        applicable.push({
            ageGroupKey,
            rule,
            tiers,
            ratioConstrainedCapacity: ratioLimitedCapacity(tiers),
        });
    }

    return { applicable, uncoveredAgeGroups };
}

/** Thin wrapper: staff required for a child count under a resolved rule set. */
export function resolveRequiredStaffForChildren(tiers: readonly RatioTier[], childCount: number) {
    return requiredStaffForChildren(tiers, childCount);
}

/** Thin wrapper: highest child count a staff count can cover under the tiers. */
export function resolveRatioCapacityForStaff(tiers: readonly RatioTier[], staffCount: number): number {
    return maxChildrenForStaff(tiers, staffCount);
}

/**
 * Resolve the binding ratio for a room/context, reconciling mixed-age rooms with
 * the `most_restrictive` policy: the binding is the HIGHEST required staff and
 * the LOWEST ratio-constrained ceiling across every represented age group.
 */
export function resolveRatio(config: RatioConfig, request: ResolveRatioRequest): ResolvedRatio {
    const policy = request.mixedAgePolicy ?? DEFAULT_MIXED_AGE_RATIO_POLICY;
    if (policy !== "most_restrictive") {
        // weighted / explicit_room_designation are future jurisdiction adapters.
        throw new RangeError(`Mixed-age ratio policy "${policy}" is not implemented in Phase A.`);
    }

    const { applicable, uncoveredAgeGroups } = resolveApplicableRatioRules(config, request);
    const warnings: OperationalResolutionWarning[] = [];

    for (const ag of uncoveredAgeGroups) {
        warnings.push({
            code: "unknown_age_group",
            message: "No applicable ratio rule for an age group present in the room.",
            context: { ageGroupKey: ag },
        });
    }

    if (applicable.length === 0) {
        // Nothing resolved. Distinguish "no rule at all" (not_configured) from a
        // request that named age groups but matched nothing (also not_configured);
        // an uncovered-but-otherwise-empty result is incomplete only when mixed
        // with covered groups (handled below).
        return {
            status: "not_configured",
            requiredStaff: null,
            ratioConstrainedCapacity: null,
            bindingRuleId: null,
            appliedRules: [],
            warnings: sortWarnings(warnings),
        };
    }

    // most_restrictive reconciliation.
    const childCount = request.childCount ?? null;
    let requiredStaff: number | null = childCount != null ? 0 : null;
    let ratioConstrainedCapacity = Number.POSITIVE_INFINITY;
    let bindingRuleId: string | null = null;

    for (const entry of applicable) {
        if (childCount != null) {
            const staff = requiredStaffForChildren(entry.tiers, childCount);
            if (staff.exceedsDefinedTiers) {
                warnings.push({
                    code: "child_count_exceeds_ratio_capacity",
                    message: "Child count exceeds the highest defined ratio tier.",
                    context: { ageGroupKey: entry.ageGroupKey, childCount },
                });
            }
            requiredStaff = Math.max(requiredStaff ?? 0, staff.requiredStaff);
        }
        if (entry.ratioConstrainedCapacity < ratioConstrainedCapacity) {
            ratioConstrainedCapacity = entry.ratioConstrainedCapacity;
            bindingRuleId = entry.rule.id;
        }
    }

    const appliedRules = sortAppliedRules(
        applicable.map((entry) => appliedRuleOf(entry.rule, entry.rule.id === bindingRuleId))
    );

    // Uncovered age groups mean the answer is partial and must not read as safe.
    const status: OperationalResolutionStatus = uncoveredAgeGroups.length > 0 ? "incomplete" : "resolved";

    return {
        status,
        requiredStaff,
        ratioConstrainedCapacity: Number.isFinite(ratioConstrainedCapacity) ? ratioConstrainedCapacity : null,
        bindingRuleId,
        appliedRules,
        warnings: sortWarnings(warnings),
    };
}

/** Alias matching the A6 plan vocabulary. */
export const resolveMixedAgeRatio = resolveRatio;
