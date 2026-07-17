/**
 * Operational Calculation Result — the V1 canonical result contract.
 *
 * This is the "Result" layer of the frozen platform pattern
 * (Definition → Handler → Runtime → Result). An Operational Calculation Result
 * is the typed operational truth a Runtime produces by resolving a Definition
 * against configuration, facts, and an injected clock. It is DERIVED, never
 * stored as a system of record.
 *
 * The V1 core is intentionally small (governing doc §Part 2.1): every field here
 * is one every future family must satisfy, so only fields whose absence makes a
 * live result untrustworthy or unreusable are mandatory. Family-specific detail
 * lives in the typed {@link OperationalCalculationValue} union (§2.3) and in
 * per-family extensions, never in this core.
 *
 * Provenance in V1 is carried by `appliedRules` (ruleId / scopeType / scopeId /
 * sourceKey). The richer explanation graph, rejectedAlternatives, precision, and
 * confidence are family extensions deferred until the families that need them
 * (§2.2, §2.4). This contract composes — and does not replace — the existing
 * resolution primitives in `@/lib/location/operationalResolutionContracts`.
 *
 * Governing architecture (frozen):
 *   docs/sprints/07_2026/operational-calculations-architecture/04-realization-plan.md §Part 2
 *   docs/sprints/07_2026/operational-calculations-architecture/06-naming-and-layer-freeze.md
 *
 * Pure types only. No IO, no Supabase client, no UI dependency.
 */

import type {
    AppliedOperationalRule,
    OperationalResolutionStatus,
    OperationalResolutionWarning,
} from "@/lib/location/operationalResolutionContracts";

/**
 * The ten calculation families (governing doc 03 §4 / 05 §5). Every registered
 * Definition declares exactly one. Only `resource_requirements` and `capacity`
 * are realized in V1; the rest are named so the catalog and routing are stable
 * for future family registration.
 */
export type OperationalCalculationFamily =
    | "resource_requirements"
    | "capacity"
    | "occupancy"
    | "attendance"
    | "scheduling"
    | "placement"
    | "priority"
    | "commercial"
    | "financial"
    | "forecast"
    | "variance"
    | "metrics";

/**
 * The five resolution states (governing doc §2.5). A superset of the four
 * {@link OperationalResolutionStatus} primitives with `partial` added for
 * multi-entry results (some entries resolved, others not).
 *
 * NONE of these is a verdict. `incomplete` does not mean "violated";
 * `not_configured` does not mean "compliant". A consumer that reads
 * `not_configured` as healthy has invented a judgment (that is Operational
 * Expectations, not Operational Calculations).
 */
export type CalculationResolutionStatus = OperationalResolutionStatus | "partial";

/** Scope types a calculation resolves at, most-specific last (room > program > site > org). */
export type CalculationScopeType = "org" | "site" | "program" | "room";

/** Where a result was resolved. `id` is null only for org-wide scope. */
export type CalculationScope = {
    type: CalculationScopeType;
    id: string | null;
};

/** The configuration coordinate (when) a result was resolved against. */
export type CalculationEffective = {
    /** Point-in-time resolution date (YYYY-MM-DD or ISO). */
    asOf: string;
    /** Present for windowed families; absent for point-in-time. */
    window?: { start: string; end?: string };
};

/**
 * The tenant configuration a result read — the third leg of the reproducibility
 * triad (contractVersion · engineVersion · configVersion). `version` identifies
 * the config revision; `effectiveOn` is the date the revision was read at.
 * Config is not independently versioned in V1, so callers supply the coordinate;
 * see {@link defaultConfigVersion}.
 */
export type CalculationConfigVersion = {
    version: string;
    effectiveOn: string | null;
};

/**
 * Which limit set the binding capacity (explainability). Structurally identical
 * to the childcare `CapacityLimitingFactor`; defined here so the platform result
 * contract does not depend on a domain module.
 */
export type CapacityLimitingFactor = "physical" | "licensed" | "operational" | "ratio" | "staffed";

/** A ratio tier that bound a requirement result (explainability). */
export type CalculationTierRef = {
    ruleId: string;
    maxChildren: number;
    requiredStaff: number;
};

/**
 * Resource Requirements value — required staff and the ratio-limited ceiling for
 * a cohort. `requiredStaff`/`ratioConstrainedCapacity` are null when unknown,
 * NEVER 0 or a coerced default. `exceedsDefinedTiers` is honesty about a child
 * count beyond the highest configured tier (the result is then `incomplete`).
 */
export type RequirementValue = {
    kind: "requirement";
    requiredStaff: number | null;
    ratioConstrainedCapacity: number | null;
    appliedTier: CalculationTierRef | null;
    exceedsDefinedTiers: boolean;
};

/**
 * Capacity value — distinct capacity kinds are ALWAYS separate; a `null` kind is
 * "unknown / not configured", never 0 or Infinity, and never collapsed into one
 * ambiguous number. `remaining` is non-null only for a fully resolved result with
 * known occupancy. `staffed` is null in V1 (G3 — staffing-supply facts are not
 * built; the family says "I don't know" rather than fabricate coverage).
 */
export type CapacityValue = {
    kind: "capacity";
    physical: number | null;
    licensed: number | null;
    operational: number | null;
    ratioLimited: number | null;
    staffed: number | null;
    binding: number | null;
    limitingFactor: CapacityLimitingFactor | null;
    remaining: number | null;
};

/**
 * Family-typed value union (governing doc §2.3). `value` is NEVER a forced
 * scalar — four of the eight shapes are non-scalar, which is exactly why the
 * scalar-only OIP implementation must not be the reference. `kind: "scalar"` is
 * one member of the union, not its base.
 *
 * V1 realizes `requirement` and `capacity`. The remaining members are reserved
 * (typed, not yet produced) so the contract shape is frozen for future families.
 */
export type OperationalCalculationValue =
    | RequirementValue
    | CapacityValue
    // ---- reserved for future families (typed now; not produced in V1) ----
    | { kind: "scalar"; value: number | null; numerator?: number | null; denominator?: number | null }
    | { kind: "set"; entries: readonly unknown[] }
    | { kind: "ordering"; bucketKey: string; sortTuple: readonly (string | number | null)[] }
    | { kind: "money"; lines: readonly unknown[]; net: unknown }
    | { kind: "completeness"; gaps: readonly unknown[]; counts: Record<string, number> };

/** The `value.kind` discriminant a Definition declares as its `resultKind`. */
export type OperationalCalculationResultKind = OperationalCalculationValue["kind"];

/**
 * The V1 Operational Calculation Result. Generic over its value shape so a
 * `capacity.*` result is statically a {@link CapacityValue} and a `resource.*`
 * result is a {@link RequirementValue}.
 */
export type OperationalCalculationResult<V extends OperationalCalculationValue = OperationalCalculationValue> = {
    /** Stable `<family>.<name>` identity — the OE binding target. */
    calculationKey: string;
    family: OperationalCalculationFamily;
    /** Trustworthiness of the value. A resolution state, never a verdict. */
    status: CalculationResolutionStatus;
    /** The family-typed operational truth. */
    value: V;
    scope: CalculationScope;
    effective: CalculationEffective;
    /** The mandatory-minimum explanation. May be empty (pure fact folds). */
    appliedRules: readonly AppliedOperationalRule[];
    /** Structured, machine-readable — never free-form prose. */
    warnings: readonly OperationalResolutionWarning[];
    /** Result shape version. */
    contractVersion: string;
    /** The handler code version. */
    engineVersion: string;
    /** The tenant config the result read. */
    configVersion: CalculationConfigVersion;
    /** ISO instant from the INJECTED clock (determinism). */
    evaluatedAt: string;
};

/** Convenience for a config coordinate when config carries no explicit revision (V1). */
export function defaultConfigVersion(effectiveOn: string | null): CalculationConfigVersion {
    return { version: "config@effective", effectiveOn };
}

/** All value kinds — used by the registration validator (see `definition.ts`). */
export const CALCULATION_RESULT_KINDS: readonly OperationalCalculationResultKind[] = [
    "requirement",
    "capacity",
    "scalar",
    "set",
    "ordering",
    "money",
    "completeness",
] as const;
