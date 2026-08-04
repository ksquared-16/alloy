/**
 * Operational Calculations — governed descriptor layer over the OIP metric registry.
 *
 * An Operational Calculation is the canonical, versioned definition of a measurable
 * business fact. It does NOT compute — it references an existing `OipMetricKey` and
 * delegates math to OIP resolvers. This module defines the descriptor contract only.
 *
 * Doctrine: docs/platform/core/operational-calculations.md
 */

import type {
    OipMetricKey,
    MetricComputationKind,
    MetricFormat,
    MetricDimensionKey,
    MetricPackKey,
} from "@/lib/metrics/types";
import type { MetricEntityScope, MetricAggregation } from "@/lib/metrics/platform/types";

/** Owning business process. Aligns with OIP packs plus financial (future adapters). */
export type OperationalCalculationBusinessProcess =
    | "enrollment"
    | "communications"
    | "forms"
    | "operational_health"
    | "capacity"
    | "financial";

export type OperationalCalculationStatus = "draft" | "active" | "archived";

/** Access-scope level enforced via AdminAccessScopeDimensions at resolve time. */
export type CalculationAccessScopeLevel = "org" | "site" | "department";

export type OperationalCalculationConsumer =
    | "analytics"
    | "workspace_header"
    | "work_unit_header"
    | "business_process_tile"
    | "focus_panel"
    | "reports"
    | "optimization_center"
    | "bos"
    | "ai";

export type OperationalCalculationRefreshStrategy = "live" | "snapshot";

export type OperationalCalculationDeprecation = {
    replacedBy?: OipMetricKey;
    sunsetIso?: string;
    note?: string;
};

/**
 * Governance overlay — the fields a calculation declares ON TOP of its wrapped OIP
 * definition. Fields derivable from the OIP `MetricDefinition` (format, dimensions,
 * required inputs, snapshot strategy, business process) are NOT in the overlay; they
 * are sourced from OIP at registration time so they can never drift.
 */
export type OperationalCalculationGovernance = {
    /** The operator question this fact answers, in one sentence. */
    questionAnswered: string;
    /** Supported entity scopes (grain). Must be non-empty. */
    grains: readonly MetricEntityScope[];
    /** How values combine across grain. */
    aggregation: MetricAggregation;
    /** Other calculations this one composes (rollups / health scores). */
    dependencies: readonly OipMetricKey[];
    /** Team / resolver accountable for correctness of the underlying math. */
    logicOwner: string;
    /** Live evaluation vs snapshot cadence. */
    refreshStrategy: OperationalCalculationRefreshStrategy;
    /** Declared downstream surfaces — drives impact analysis on change. */
    consumers: readonly OperationalCalculationConsumer[];
    /** Access-scope level enforced at resolve time. */
    accessScope: CalculationAccessScopeLevel;
    /** Contract version (semantics), not data version. Bumped on a "what counts" change. */
    version: number;
    /** How correctness is proven. */
    testingStrategy: string;
    status: OperationalCalculationStatus;
    /**
     * Default drill contract. Resolved by DrillResolver. If absent, `exploratoryOnly`
     * MUST be true — no calculation may dead-end.
     */
    drillContractId?: string;
    /** True for board/exploration calculations that legitimately have no drill. */
    exploratoryOnly?: boolean;
    /** Required when status === "archived". */
    deprecation?: OperationalCalculationDeprecation;
};

/**
 * A fully-resolved Operational Calculation descriptor: governance overlay + the
 * fields mirrored from its wrapped OIP definition.
 */
export type OperationalCalculation = OperationalCalculationGovernance & {
    /** Stable identifier — equals the wrapped OipMetricKey. */
    key: OipMetricKey;
    label: string;
    businessProcess: OperationalCalculationBusinessProcess;
    /** Mirrored from OIP `MetricDefinition.format`. */
    format: MetricFormat;
    /** Mirrored from OIP `MetricDefinition.computationKind`. */
    snapshotStrategy: MetricComputationKind;
    /** True when OIP marks the fact bounded/capped (not exhaustive org truth). */
    bounded: boolean;
    /** Segmentable dimensions — mirrored from OIP `supportsDimensions`. */
    dimensions: readonly MetricDimensionKey[];
    /** Source tables / read models — mirrored from OIP `sources`. */
    requiredInputs: readonly string[];
};

/**
 * Maps an OIP pack to its owning business process. Identity for most packs.
 *
 * `trust` is deliberately NOT identity. Trust is platform infrastructure every
 * capability consumes, not a business process an organization runs \u2014 inventing a
 * "trust" business process would file reasoning governance alongside enrollment
 * and billing, which is a category error. It maps onto operational health, where
 * platform reliability already lives.
 */
export const PACK_TO_BUSINESS_PROCESS: Record<MetricPackKey, OperationalCalculationBusinessProcess> = {
    enrollment: "enrollment",
    communications: "communications",
    forms: "forms",
    operational_health: "operational_health",
    capacity: "capacity",
    trust: "operational_health",
};
