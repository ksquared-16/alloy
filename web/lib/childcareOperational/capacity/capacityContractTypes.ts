/**
 * Canonical Capacity + Ratio resolution contracts (Phase A, A8 / A5 / A6).
 *
 * One capacity truth surface (RFC §8): distinct capacity kinds are never
 * collapsed into a single ambiguous number, and unknown values stay `null` with
 * an explicit `status`. Ratios are stepped tiers with an extensible mixed-age
 * policy (RFC §9); `most_restrictive` is the only Phase-A-supported policy.
 *
 * Pure types only. No IO, no Supabase client, no UI dependency.
 */

import type {
    AppliedOperationalRule,
    OperationalResolutionStatus,
    OperationalResolutionWarning,
} from "@/lib/location/operationalResolutionContracts";

/**
 * Mixed-age reconciliation policy. Only `most_restrictive` is implemented in
 * Phase A; `weighted` (jurisdiction points math) and `explicit_room_designation`
 * are future adapters behind this same contract (RFC §9 item 8).
 */
export type MixedAgeRatioPolicy = "most_restrictive" | "weighted" | "explicit_room_designation";

export const DEFAULT_MIXED_AGE_RATIO_POLICY: MixedAgeRatioPolicy = "most_restrictive";

/** Which limit set the binding capacity (explainability). */
export type CapacityLimitingFactor = "physical" | "licensed" | "operational" | "ratio" | "staffed";

/** Occupancy inputs supplied by the caller (from L2/L4 read models). */
export type OperationalOccupancyContext = {
    /** Enrolled/committed seats (from placements). */
    committed?: number | null;
    /** Offered-but-not-accepted seats (from placement offers). */
    offered?: number | null;
    /** Actually present today (from attendance facts). */
    attended?: number | null;
};

/** Staffing inputs. `staffOnHand` is a placeholder until Staffing-as-facts (G3). */
export type OperationalStaffingContext = {
    staffOnHand?: number | null;
};

/** Request to resolve one room/context's ratio at a point in time. */
export type ResolveRatioRequest = {
    /** Config context (site/program/room + a single primary age group). */
    siteLocationId?: string | null;
    programCategoryId?: string | null;
    roomLocationId?: string | null;
    ageGroupKey?: string | null;
    /**
     * Age groups actually represented among children in the room (mixed-age).
     * When absent, resolution uses the single `ageGroupKey` context.
     */
    ageGroupContext?: readonly string[];
    /** Number of children to evaluate required staff for, when known. */
    childCount?: number | null;
    /** Resolution date (YYYY-MM-DD). */
    effectiveAt: string;
    mixedAgePolicy?: MixedAgeRatioPolicy;
};

/** Resolved ratio outcome for a room/context. */
export type ResolvedRatio = {
    status: OperationalResolutionStatus;
    /** Staff required for `childCount`, or null when childCount/rules unknown. */
    requiredStaff: number | null;
    /** Highest child count the applicable tiers permit (ratio-limited ceiling). */
    ratioConstrainedCapacity: number | null;
    /** Rule that bound the result, or null. */
    bindingRuleId: string | null;
    appliedRules: AppliedOperationalRule[];
    warnings: OperationalResolutionWarning[];
};

/** Request to resolve one room/context's full operational capacity. */
export type OperationalCapacityRequest = {
    orgId: string;
    locationId: string;
    siteLocationId?: string | null;
    programCategoryId?: string | null;
    roomLocationId?: string | null;
    ageGroupKey?: string | null;
    ageGroupContext?: readonly string[];
    scheduleId?: string | null;
    /** Resolution date (YYYY-MM-DD). */
    effectiveAt: string;
    occupancyContext?: OperationalOccupancyContext;
    staffingContext?: OperationalStaffingContext | null;
    mixedAgePolicy?: MixedAgeRatioPolicy;
};

/**
 * The full capacity resolution. Distinct kinds are always separate; `null` means
 * "unknown / not configured for this kind" and is NEVER treated as 0 or Infinity.
 * `availableNow` is only a non-null value when `status === "resolved"`.
 */
export type OperationalCapacityResolution = {
    status: OperationalResolutionStatus;

    licensedCapacity: number | null;
    physicalCapacity: number | null;
    configuredCapacity: number | null;
    ratioConstrainedCapacity: number | null;
    staffedCapacity: number | null;
    bindingCapacity: number | null;

    committedOccupancy: number | null;
    offeredOccupancy: number | null;
    attendedOccupancy: number | null;

    /** max(0, binding − committed) when resolved; null otherwise. */
    availableNow: number | null;
    forecastedAvailability: number | null;

    limitingFactor: CapacityLimitingFactor | null;
    appliedRules: AppliedOperationalRule[];
    warnings: OperationalResolutionWarning[];
};
