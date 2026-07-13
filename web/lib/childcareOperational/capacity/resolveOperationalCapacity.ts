/**
 * Canonical Capacity resolver (Phase A, A5).
 *
 * The single capacity truth surface (RFC §8): composes the existing capacity
 * engine (with the A7 licensing clamp), the A6 ratio resolver, and occupancy into
 * one status-tagged result. It does NOT build a second capacity engine — it wraps
 * `resolveCapacityBreakdown` and `resolveRatio`.
 *
 * Distinct capacity kinds are always separate; `null` means "unknown / not
 * configured" and is NEVER treated as 0 or Infinity. `availableNow` is non-null
 * only for a fully resolved result with known occupancy. `status` is first-class
 * so consumers branch on it and never coerce an unknown into a number.
 *
 * Pure: no DB, no IO. Callers load the config bundle and occupancy read models.
 */

import { resolveCapacityBreakdown } from "@/lib/childcareOperational/config/capacityRules";
import { resolveRatio, type RatioConfig } from "@/lib/childcareOperational/capacity/resolveRatio";
import type {
    ChildcareCapacityRuleRow,
    ConfigRuleScopeContext,
} from "@/lib/childcareOperational/config/configRuleTypes";
import type {
    CapacityLimitingFactor,
    OperationalCapacityRequest,
    OperationalCapacityResolution,
} from "@/lib/childcareOperational/capacity/capacityContractTypes";
import {
    mergeResolutionStatus,
    sortAppliedRules,
    sortWarnings,
    type AppliedOperationalRule,
    type OperationalResolutionStatus,
    type OperationalResolutionWarning,
} from "@/lib/location/operationalResolutionContracts";

/** Config subset the capacity resolver reads (a slice of ChildcareConfigRuleBundle). */
export type CapacityConfig = RatioConfig & {
    capacityRules: readonly ChildcareCapacityRuleRow[];
};

/** Pick the limiting factor whose value equals the binding, deterministically. */
function limitingFactorOf(
    binding: number,
    kinds: { factor: CapacityLimitingFactor; value: number | null }[]
): CapacityLimitingFactor | null {
    // Regulatory (licensed) and ratio take precedence in the explanation when tied.
    const order: CapacityLimitingFactor[] = ["licensed", "ratio", "physical", "operational", "staffed"];
    for (const factor of order) {
        const match = kinds.find((k) => k.factor === factor && k.value === binding);
        if (match) return factor;
    }
    return null;
}

export function resolveOperationalCapacity(
    config: CapacityConfig,
    request: OperationalCapacityRequest
): OperationalCapacityResolution {
    const committed = request.occupancyContext?.committed ?? null;
    const offered = request.occupancyContext?.offered ?? null;
    const attended = request.occupancyContext?.attended ?? null;

    // 1) Ratio (mixed-age aware). childCount drives required staff only.
    const ratio = resolveRatio(config, {
        siteLocationId: request.siteLocationId,
        programCategoryId: request.programCategoryId,
        roomLocationId: request.roomLocationId,
        ageGroupKey: request.ageGroupKey,
        ageGroupContext: request.ageGroupContext,
        childCount: committed,
        effectiveAt: request.effectiveAt,
        mixedAgePolicy: request.mixedAgePolicy,
    });

    // 2) Stored capacity kinds + binding (licensed already clamped by A7).
    const context: ConfigRuleScopeContext = {
        siteLocationId: request.siteLocationId ?? null,
        programCategoryId: request.programCategoryId ?? null,
        roomLocationId: request.roomLocationId ?? null,
        ageGroupKey: request.ageGroupKey ?? null,
    };
    const breakdown = resolveCapacityBreakdown(
        config.capacityRules,
        context,
        request.effectiveAt,
        ratio.ratioConstrainedCapacity
    );

    const physicalCapacity = breakdown.physical;
    const licensedCapacity = breakdown.licensed;
    const configuredCapacity = breakdown.operational;
    const ratioConstrainedCapacity = ratio.ratioConstrainedCapacity;
    const staffedCapacity: number | null = null; // G3 — not built.
    const bindingCapacity = breakdown.binding;

    // 3) Status: merge ratio status with capacity-presence status.
    const definedKinds = [physicalCapacity, licensedCapacity, configuredCapacity, ratioConstrainedCapacity].filter(
        (v): v is number => v != null
    );
    const capacityStatus: OperationalResolutionStatus = definedKinds.length > 0 ? "resolved" : "not_configured";
    const status = mergeResolutionStatus([ratio.status, capacityStatus]);

    // 4) Explainability + limiting factor.
    const warnings: OperationalResolutionWarning[] = [...ratio.warnings];
    let limitingFactor: CapacityLimitingFactor | null = null;
    const appliedRules: AppliedOperationalRule[] = [...ratio.appliedRules];

    if (bindingCapacity != null) {
        limitingFactor = limitingFactorOf(bindingCapacity, [
            { factor: "physical", value: physicalCapacity },
            { factor: "licensed", value: licensedCapacity },
            { factor: "operational", value: configuredCapacity },
            { factor: "ratio", value: ratioConstrainedCapacity },
        ]);
        if (breakdown.licensedBoundByRuleId) {
            appliedRules.push({
                ruleId: breakdown.licensedBoundByRuleId,
                ruleType: "licensed_capacity",
                scopeType: "unknown",
                sourceKey: "licensing",
                binding: limitingFactor === "licensed",
            });
        }
    }

    // 5) available now = binding − committed − offered (RFC §8 ratified formula).
    // Committed is the required input: without it availableNow is null (never
    // treated as zero). Offered (in-flight placement offers) is subtracted when
    // known; when unknown it is NOT invented as a lower number — the result is an
    // upper bound and is flagged so no consumer treats it as a guaranteed opening.
    const availableNow =
        status === "resolved" && bindingCapacity != null && committed != null
            ? Math.max(0, bindingCapacity - committed - (offered ?? 0))
            : null;
    if (bindingCapacity != null && committed == null) {
        warnings.push({
            code: "occupancy_unknown",
            message: "Committed occupancy was not supplied; available seats cannot be computed.",
        });
    } else if (availableNow != null && offered == null) {
        warnings.push({
            code: "offered_occupancy_unknown",
            message:
                "Available seats exclude in-flight placement offers (offered occupancy unknown); treat as an upper bound.",
        });
    }

    return {
        status,
        licensedCapacity,
        physicalCapacity,
        configuredCapacity,
        ratioConstrainedCapacity,
        staffedCapacity,
        bindingCapacity,
        committedOccupancy: committed,
        offeredOccupancy: offered,
        attendedOccupancy: attended,
        availableNow,
        forecastedAvailability: null, // Phase D (Planning-plane forecast).
        limitingFactor,
        appliedRules: sortAppliedRules(appliedRules),
        warnings: sortWarnings(warnings),
    };
}
