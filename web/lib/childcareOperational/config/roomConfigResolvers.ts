/**
 * Shared room -> config resolution (P2.1).
 *
 * Builds the per-room scope context (site / program / age-group) from committed
 * placements, plus closures that resolve ratio tiers and the binding capacity for
 * a room+date. Single source of truth reused by L3 expected staffing/capacity
 * (buildScheduleExpectations) and L4 actual compliance (actualCompliance), so
 * "expected" and "actual" are computed against identical rule resolution.
 *
 * Pure: no DB, no IO.
 */

import { resolveConfigRule } from "@/lib/childcareOperational/config/resolveConfigRule";
import { resolveCapacityBreakdown } from "@/lib/childcareOperational/config/capacityRules";
import { ratioLimitedCapacity, type RatioTier } from "@/lib/childcareOperational/config/ratioRules";
import type { ChildcareConfigRuleBundle } from "@/lib/childcareOperational/config/childcareConfigRuleService";
import type {
    ChildcareRatioRuleRow,
    ConfigRuleScopeContext,
} from "@/lib/childcareOperational/config/configRuleTypes";
import type {
    OperationalAgreementInput,
    OperationalPlacementInput,
} from "@/lib/childcareOperational/expectations/scheduleExpectationCore";

export type RoomConfigResolvers = {
    contextForRoom: (roomLocationId: string) => ConfigRuleScopeContext;
    resolveTiers: (roomLocationId: string, date: string) => RatioTier[];
    /** Binding (most-restrictive) capacity for a room+date, including ratio-limited. */
    resolveCapacityBinding: (roomLocationId: string, date: string) => number | null;
};

export type BuildRoomConfigResolversInput = {
    agreements: readonly OperationalAgreementInput[];
    placements: readonly OperationalPlacementInput[];
    config: ChildcareConfigRuleBundle;
    ageGroupByRoomLocationId?: Readonly<Record<string, string | null>>;
    ageGroupByProgramCategoryId?: Readonly<Record<string, string | null>>;
};

type RoomContext = {
    siteLocationId: string;
    programCategoryId: string | null;
    ageGroupKey: string | null;
};

export function buildRoomConfigResolvers(input: BuildRoomConfigResolversInput): RoomConfigResolvers {
    const { config } = input;

    const siteByAgreement = new Map<string, string>();
    for (const a of input.agreements) siteByAgreement.set(a.id, a.site_location_id);

    const roomContext = new Map<string, RoomContext>();
    for (const p of input.placements) {
        if (!p.room_location_id) continue;
        const siteLocationId = siteByAgreement.get(p.enrollment_agreement_id);
        if (!siteLocationId) continue;
        // Child placement-derived program category is canonical; room config is fallback.
        const ageGroupKey =
            (p.program_category_id
                ? input.ageGroupByProgramCategoryId?.[p.program_category_id] ?? null
                : null) ??
            input.ageGroupByRoomLocationId?.[p.room_location_id] ??
            null;
        if (!roomContext.has(p.room_location_id)) {
            roomContext.set(p.room_location_id, {
                siteLocationId,
                programCategoryId: p.program_category_id,
                ageGroupKey,
            });
        }
    }

    const tiersByRatioRuleId = new Map<string, RatioTier[]>();
    for (const tier of config.ratioRuleTiers) {
        const list = tiersByRatioRuleId.get(tier.ratio_rule_id) ?? [];
        list.push({ max_children: tier.max_children, required_staff: tier.required_staff });
        tiersByRatioRuleId.set(tier.ratio_rule_id, list);
    }

    const contextForRoom = (roomLocationId: string): ConfigRuleScopeContext => {
        const ctx = roomContext.get(roomLocationId);
        return {
            siteLocationId: ctx?.siteLocationId ?? null,
            programCategoryId: ctx?.programCategoryId ?? null,
            roomLocationId,
            ageGroupKey: ctx?.ageGroupKey ?? null,
        };
    };

    const resolveTiers = (roomLocationId: string, date: string): RatioTier[] => {
        const rule: ChildcareRatioRuleRow | null = resolveConfigRule(
            config.ratioRules,
            contextForRoom(roomLocationId),
            date
        );
        return rule ? tiersByRatioRuleId.get(rule.id) ?? [] : [];
    };

    const resolveCapacityBinding = (roomLocationId: string, date: string): number | null => {
        const ratioLimited = ratioLimitedCapacity(resolveTiers(roomLocationId, date)) || null;
        return resolveCapacityBreakdown(
            config.capacityRules,
            contextForRoom(roomLocationId),
            date,
            ratioLimited
        ).binding;
    };

    return { contextForRoom, resolveTiers, resolveCapacityBinding };
}
