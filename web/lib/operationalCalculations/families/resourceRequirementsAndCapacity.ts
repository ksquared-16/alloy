/**
 * Resource Requirements & Capacity — the first registered Operational Calculation
 * family (governing doc 04 Part 4 / Part 10).
 *
 * Four Definitions, each wrapping an ALREADY-BUILT, ALREADY-PURE, ALREADY-TESTED
 * resolver. This module registers governance over existing computation; it adds
 * no new math and it changes no existing resolver:
 *
 *   - resource.required_staff  → wraps `resolveRatio` (requiredStaffForChildren)
 *   - resource.ratio           → wraps `resolveRatio` (ratioLimitedCapacity)
 *   - capacity.room_binding    → wraps `resolveOperationalCapacity` (binding)
 *   - capacity.remaining       → wraps `resolveOperationalCapacity` (availableNow)
 *
 * Discipline this family proves (its whole reason for being first):
 *   - Typed values, never a forced scalar: `requirement` and `capacity`.
 *   - `null` is "I don't know", never 0 / Infinity / a default.
 *   - A child count beyond the highest configured tier is `incomplete` with the
 *     top-tier staffing FLAGGED, not silently trusted (honesty added around the
 *     unchanged resolver, which itself still returns `resolved` + a warning).
 *   - `staffed` stays null (G3 — staffing-supply facts are not built). The family
 *     says "I don't know" rather than fabricate coverage.
 *   - NO verdicts: no `compliant` / `breached` / `over_capacity` / `understaffed`.
 *
 * Pure: no IO. Callers load the config bundle and occupancy read models and pass
 * them in the request.
 */

import { sortRatioTiers } from "@/lib/childcareOperational/config/ratioRules";
import {
    resolveApplicableRatioRules,
    resolveRatio,
    type RatioConfig,
} from "@/lib/childcareOperational/capacity/resolveRatio";
import {
    resolveOperationalCapacity,
    type CapacityConfig,
} from "@/lib/childcareOperational/capacity/resolveOperationalCapacity";
import type {
    OperationalCapacityRequest,
    ResolveRatioRequest,
} from "@/lib/childcareOperational/capacity/capacityContractTypes";
import {
    defineOperationalCalculation,
    type HandlerComputation,
    type OperationalCalculationDefinition,
} from "@/lib/operationalCalculations/definition";
import type {
    CalculationResolutionStatus,
    CalculationScope,
    CalculationTierRef,
    CapacityValue,
    RequirementValue,
} from "@/lib/operationalCalculations/resultContract";

/** The warning code `resolveRatio` emits when a child count exceeds the top tier. */
const EXCEEDS_TIERS_WARNING = "child_count_exceeds_ratio_capacity";

const RATIO_ENGINE_VERSION = "childcare.resolveRatio@1.0.0";
const CAPACITY_ENGINE_VERSION = "childcare.resolveOperationalCapacity@1.0.0";
const CONTRACT_VERSION = "1.0";

// ---- request shapes: the config bundle + the resolution params, together ----

/** Request for the two `resource.*` calculations. */
export type ResourceRequirementRequest = {
    config: RatioConfig;
    params: ResolveRatioRequest;
};

/** Request for the two `capacity.*` calculations. */
export type CapacityCalculationRequest = {
    config: CapacityConfig;
    params: OperationalCapacityRequest;
};

// ---- scope derivation (room > program > site > org) ----

function scopeFromRatioParams(params: ResolveRatioRequest): CalculationScope {
    if (params.roomLocationId) return { type: "room", id: params.roomLocationId };
    if (params.programCategoryId) return { type: "program", id: params.programCategoryId };
    if (params.siteLocationId) return { type: "site", id: params.siteLocationId };
    return { type: "org", id: null };
}

function scopeFromCapacityParams(params: OperationalCapacityRequest): CalculationScope {
    if (params.roomLocationId) return { type: "room", id: params.roomLocationId };
    if (params.programCategoryId) return { type: "program", id: params.programCategoryId };
    if (params.siteLocationId) return { type: "site", id: params.siteLocationId };
    return { type: "org", id: params.orgId ?? null };
}

/**
 * Derive the tier that covered the requirement, for explainability. Reuses the
 * existing pure resolution + tier ordering — no new math. Returns null when the
 * covering tier is ambiguous (mixed-age) or when the count is beyond all tiers.
 */
function deriveAppliedTier(request: ResourceRequirementRequest): CalculationTierRef | null {
    const childCount = request.params.childCount;
    if (childCount == null) return null;
    const { applicable } = resolveApplicableRatioRules(request.config, request.params);
    if (applicable.length !== 1) return null;
    const entry = applicable[0];
    const covering = sortRatioTiers(entry.tiers).find((t) => childCount <= t.max_children);
    if (!covering) return null;
    return {
        ruleId: entry.rule.id,
        maxChildren: covering.max_children,
        requiredStaff: covering.required_staff,
    };
}

/**
 * Shared adapter for the two `resource.*` calculations: run the unchanged ratio
 * resolver, then shape a `requirement` value. Beyond-range tiers make the
 * REGISTERED result `incomplete` (honesty), while the underlying resolver is
 * untouched.
 */
function evaluateRequirement(request: ResourceRequirementRequest): HandlerComputation<RequirementValue> {
    const ratio = resolveRatio(request.config, request.params);
    const exceedsDefinedTiers = ratio.warnings.some((w) => w.code === EXCEEDS_TIERS_WARNING);

    const status: CalculationResolutionStatus = exceedsDefinedTiers ? "incomplete" : ratio.status;

    const value: RequirementValue = {
        kind: "requirement",
        requiredStaff: ratio.requiredStaff,
        ratioConstrainedCapacity: ratio.ratioConstrainedCapacity,
        appliedTier: deriveAppliedTier(request),
        exceedsDefinedTiers,
    };

    return {
        status,
        value,
        scope: scopeFromRatioParams(request.params),
        effective: { asOf: request.params.effectiveAt },
        appliedRules: ratio.appliedRules,
        warnings: ratio.warnings,
    };
}

/**
 * Shared adapter for the two `capacity.*` calculations: run the unchanged
 * capacity resolver and shape a `capacity` value. Distinct kinds stay separate;
 * `staffed` stays null (G3).
 */
function evaluateCapacity(request: CapacityCalculationRequest): HandlerComputation<CapacityValue> {
    const res = resolveOperationalCapacity(request.config, request.params);

    const value: CapacityValue = {
        kind: "capacity",
        physical: res.physicalCapacity,
        licensed: res.licensedCapacity,
        operational: res.configuredCapacity,
        ratioLimited: res.ratioConstrainedCapacity,
        staffed: res.staffedCapacity, // null — G3.
        binding: res.bindingCapacity,
        limitingFactor: res.limitingFactor,
        remaining: res.availableNow,
    };

    return {
        status: res.status,
        value,
        scope: scopeFromCapacityParams(request.params),
        effective: { asOf: request.params.effectiveAt },
        appliedRules: res.appliedRules,
        warnings: res.warnings,
    };
}

// ---- the four Definitions ----

export const RESOURCE_REQUIRED_STAFF: OperationalCalculationDefinition<
    ResourceRequirementRequest,
    RequirementValue
> = defineOperationalCalculation({
    key: "resource.required_staff",
    family: "resource_requirements",
    purpose: "How many staff are required to remain ratio-compliant for this cohort?",
    handler: {
        kind: "pure",
        ref: "childcareOperational/capacity/resolveRatio.resolveRatio",
        engineVersion: RATIO_ENGINE_VERSION,
        evaluate: evaluateRequirement,
    },
    ruleShapes: ["tiered_ratio", "fixed_ratio"],
    scopes: ["org", "site", "program", "room"],
    effectiveTime: "point_in_time",
    resultKind: "requirement",
    contractVersion: CONTRACT_VERSION,
    consumers: ["scheduling"],
    expectationBindable: true,
    logicOwner: "Childcare Operational — ratio resolvers",
    status: "active",
    testingStrategy:
        "Conformance vs resolveRatio: tiered 1:5→2:11; beyond-range ⇒ incomplete + flagged; uncovered age ⇒ incomplete.",
});

export const RESOURCE_RATIO: OperationalCalculationDefinition<
    ResourceRequirementRequest,
    RequirementValue
> = defineOperationalCalculation({
    key: "resource.ratio",
    family: "resource_requirements",
    purpose: "What is the ratio-limited child capacity for this cohort under the applicable tiers?",
    handler: {
        kind: "pure",
        ref: "childcareOperational/capacity/resolveRatio.resolveRatio",
        engineVersion: RATIO_ENGINE_VERSION,
        evaluate: evaluateRequirement,
    },
    ruleShapes: ["tiered_ratio", "fixed_ratio"],
    scopes: ["org", "site", "program", "room"],
    effectiveTime: "point_in_time",
    resultKind: "requirement",
    contractVersion: CONTRACT_VERSION,
    consumers: ["scheduling"],
    expectationBindable: true,
    logicOwner: "Childcare Operational — ratio resolvers",
    status: "active",
    testingStrategy:
        "Conformance vs resolveRatio: ratioConstrainedCapacity = highest permitted count; most-restrictive across mixed age.",
});

export const CAPACITY_ROOM_BINDING: OperationalCalculationDefinition<
    CapacityCalculationRequest,
    CapacityValue
> = defineOperationalCalculation({
    key: "capacity.room_binding",
    family: "capacity",
    purpose: "What is the binding seat capacity for this room, and which limit sets it?",
    handler: {
        kind: "pure",
        ref: "childcareOperational/capacity/resolveOperationalCapacity.resolveOperationalCapacity",
        engineVersion: CAPACITY_ENGINE_VERSION,
        evaluate: evaluateCapacity,
    },
    ruleShapes: ["capacity_kind", "licensed_ceiling", "tiered_ratio"],
    scopes: ["org", "site", "program", "room"],
    effectiveTime: "point_in_time",
    resultKind: "capacity",
    contractVersion: CONTRACT_VERSION,
    consumers: ["scheduling"],
    expectationBindable: true,
    logicOwner: "Childcare Operational — capacity resolvers",
    status: "active",
    testingStrategy:
        "Conformance vs resolveOperationalCapacity: distinct kinds separate; licensed min-clamp; null kind excluded (never 0).",
});

export const CAPACITY_REMAINING: OperationalCalculationDefinition<
    CapacityCalculationRequest,
    CapacityValue
> = defineOperationalCalculation({
    key: "capacity.remaining",
    family: "capacity",
    purpose: "How many seats remain available now, given committed and offered occupancy?",
    handler: {
        kind: "pure",
        ref: "childcareOperational/capacity/resolveOperationalCapacity.resolveOperationalCapacity",
        engineVersion: CAPACITY_ENGINE_VERSION,
        evaluate: evaluateCapacity,
    },
    ruleShapes: ["capacity_kind", "licensed_ceiling", "tiered_ratio"],
    scopes: ["org", "site", "program", "room"],
    effectiveTime: "point_in_time",
    resultKind: "capacity",
    contractVersion: CONTRACT_VERSION,
    consumers: ["scheduling"],
    expectationBindable: true,
    logicOwner: "Childcare Operational — capacity resolvers",
    status: "active",
    testingStrategy:
        "Conformance vs resolveOperationalCapacity: remaining = max(0, binding − committed − offered); null (not 0) when occupancy unknown.",
});

/** The Resource Requirements & Capacity family — the V1 registration set. */
export const RESOURCE_AND_CAPACITY_DEFINITIONS: readonly OperationalCalculationDefinition[] = [
    RESOURCE_REQUIRED_STAFF,
    RESOURCE_RATIO,
    CAPACITY_ROOM_BINDING,
    CAPACITY_REMAINING,
] as OperationalCalculationDefinition[];
