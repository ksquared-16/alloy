/**
 * Operational Calculation Definition + Handler — the governed unit and the code
 * that computes it.
 *
 * These are the first two layers of the frozen platform pattern
 * (Definition → Handler → Runtime → Result), with the canonical nouns from the
 * naming freeze (doc 06 §1.4):
 *
 *   - Operational Calculation Definition — the governed, versioned platform
 *     identity the registry holds. It NEVER computes and NEVER holds a value; it
 *     is pure governance metadata plus a pointer to a Handler.
 *   - Operational Calculation Handler — the code that computes. Pure, code-owned,
 *     never configuration and never tenant-authored.
 *
 * The one net-new engineering concept the whole architecture introduces is the
 * `handler` slot (doc 05 §0). A handler is a CODE REFERENCE, never an
 * expression: the registry is therefore not a formula builder, not a scripting
 * surface, and not a DB calculation interpreter. A tenant may select a rule-shape
 * instance and parameterize it; a tenant never authors a handler or a shape.
 *
 * Governing architecture (frozen):
 *   docs/sprints/07_2026/operational-calculations-architecture/05-registration-architecture.md §3
 *   docs/sprints/07_2026/operational-calculations-architecture/06-naming-and-layer-freeze.md
 *
 * Pure types + a pure registration validator. No IO, no UI dependency.
 */

import type { OipMetricKey } from "@/lib/metrics/types";
import type {
    AppliedOperationalRule,
    OperationalResolutionWarning,
} from "@/lib/location/operationalResolutionContracts";
import {
    CALCULATION_RESULT_KINDS,
    type CalculationEffective,
    type CalculationResolutionStatus,
    type CalculationScope,
    type OperationalCalculationFamily,
    type OperationalCalculationResultKind,
    type OperationalCalculationValue,
} from "@/lib/operationalCalculations/resultContract";

/**
 * The closed set of rule shapes handlers may support (doc 05 §3 / 04 §3.1).
 * Code-owned and finite: a tenant parameterizes a shape instance, never authors
 * a shape. Extended only in code as new families register.
 */
export const SUPPORTED_RULE_SHAPES = [
    "tiered_ratio",
    "fixed_ratio",
    "capacity_kind",
    "licensed_ceiling",
    // Schedule-derived facts (occupancy from committed schedule assignments +
    // placements) are not config-rule shaped. Added as the Scheduling family
    // registered (doc: the closed set extends in code as new families register).
    "schedule_derived",
] as const;

export type CalculationRuleShape = (typeof SUPPORTED_RULE_SHAPES)[number];

/** Effective-time support a Definition declares. */
export type CalculationEffectiveTimeMode = "point_in_time" | "window" | "as_of";

/** Declared downstream consumers — drives the impact list on change. */
export type OperationalCalculationConsumer =
    | "scheduling"
    | "attendance"
    | "commercial"
    | "communications"
    | "business_processes"
    | "operational_intelligence"
    | "current_work"
    | "bos"
    | "operational_expectations"
    | "action_system"
    | "placement"
    | "analytics";

export type OperationalCalculationLifecycle = "draft" | "active" | "archived";

export type OperationalCalculationDeprecation = {
    replacedBy?: string;
    sunsetIso?: string;
    note?: string;
};

/**
 * What a Handler returns for one resolution: the family-typed value plus the
 * resolution state, the scope and effective coordinate it resolved at, and its
 * provenance. The Runtime stamps identity, versions, config coordinate, and the
 * injected-clock instant around this — so the Handler owns computation and the
 * Runtime owns the envelope (clean layer separation).
 */
export type HandlerComputation<V extends OperationalCalculationValue> = {
    status: CalculationResolutionStatus;
    value: V;
    scope: CalculationScope;
    effective: CalculationEffective;
    appliedRules: readonly AppliedOperationalRule[];
    warnings: readonly OperationalResolutionWarning[];
};

/**
 * A pure, code-owned handler. `ref` names the canonical function(s) it wraps
 * (governance + impact analysis); `evaluate` is the deterministic adapter that
 * invokes the existing pure implementation and shapes its output into the V1
 * result value. `engineVersion` versions the handler code.
 */
export type PureHandler<Req, V extends OperationalCalculationValue> = {
    kind: "pure";
    /** Canonical function reference this handler wraps, for impact analysis. */
    ref: string;
    engineVersion: string;
    evaluate: (request: Req) => HandlerComputation<V>;
};

/**
 * An OIP-backed handler kind — the existing metric registry expressed as one
 * handler kind, so the model is a strict superset. Reserved in V1: the 17 OIP
 * descriptors continue to resolve through their existing registry
 * (`@/lib/analytics/calculations/registry`) and are not re-registered here.
 * Convergence is a later roadmap phase.
 */
export type OipHandler = {
    kind: "oip";
    metricKey: OipMetricKey;
    engineVersion: string;
};

export type OperationalCalculationHandler<Req, V extends OperationalCalculationValue> =
    | PureHandler<Req, V>
    | OipHandler;

/**
 * An Operational Calculation Definition — the governed unit the registry holds.
 * Generic over its request and value shapes so a definition, its handler, and
 * the results it yields are statically consistent.
 */
export type OperationalCalculationDefinition<
    Req = unknown,
    V extends OperationalCalculationValue = OperationalCalculationValue,
> = {
    /** Stable `<family>.<name>` identity. Namespaced by family, not by module. */
    key: string;
    family: OperationalCalculationFamily;
    /** The operator question this fact answers, in one sentence. */
    purpose: string;
    /** The code that computes. */
    handler: OperationalCalculationHandler<Req, V>;
    /** The closed set of rule shapes the handler supports. */
    ruleShapes: readonly CalculationRuleShape[];
    /** Scope types it resolves at. */
    scopes: readonly CalculationScope["type"][];
    effectiveTime: CalculationEffectiveTimeMode;
    /** The `value.kind` discriminant the handler emits. */
    resultKind: OperationalCalculationResultKind;
    /** Result-shape version. */
    contractVersion: string;
    /** Declared downstream consumers — the impact list on change. */
    consumers: readonly OperationalCalculationConsumer[];
    /**
     * May an Operational Expectation Condition bind this key? Carried on the
     * Definition so an attempt to bind a non-bindable family (e.g. a ranking) is
     * a registration-time fact, not a runtime surprise (doc 05 §7).
     */
    expectationBindable: boolean;
    /** Accountable owner of the underlying math. */
    logicOwner: string;
    status: OperationalCalculationLifecycle;
    /** How correctness is proven. */
    testingStrategy: string;
    /** Required when status === "archived". */
    deprecation?: OperationalCalculationDeprecation;
};

const RULE_SHAPE_SET = new Set<string>(SUPPORTED_RULE_SHAPES);
const RESULT_KIND_SET = new Set<string>(CALCULATION_RESULT_KINDS);
const KEY_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;

/**
 * Build and validate an Operational Calculation Definition. Fails closed at
 * registration time on the invariants the integrity tests also assert:
 *   - key is `<family>.<name>` shaped
 *   - every declared rule shape is in the closed supported set
 *   - resultKind is a known value kind
 *   - scopes is non-empty
 *   - an archived definition carries deprecation metadata
 *
 * This is the authoring API of the registration model (doc 05 §4 stage 1–2). It
 * does not compute — it returns a frozen, governed Definition.
 */
export function defineOperationalCalculation<Req, V extends OperationalCalculationValue>(
    spec: OperationalCalculationDefinition<Req, V>,
): OperationalCalculationDefinition<Req, V> {
    if (!KEY_PATTERN.test(spec.key)) {
        throw new Error(
            `Operational Calculation key "${spec.key}" must be "<family>.<name>" (lower_snake).`,
        );
    }
    if (spec.ruleShapes.length === 0) {
        throw new Error(`Operational Calculation "${spec.key}" must declare at least one rule shape.`);
    }
    for (const shape of spec.ruleShapes) {
        if (!RULE_SHAPE_SET.has(shape)) {
            throw new Error(
                `Operational Calculation "${spec.key}" declares unsupported rule shape "${shape}".`,
            );
        }
    }
    if (!RESULT_KIND_SET.has(spec.resultKind)) {
        throw new Error(`Operational Calculation "${spec.key}" declares unknown resultKind "${spec.resultKind}".`);
    }
    if (spec.scopes.length === 0) {
        throw new Error(`Operational Calculation "${spec.key}" must declare at least one scope.`);
    }
    if (spec.status === "archived" && !spec.deprecation) {
        throw new Error(`Archived Operational Calculation "${spec.key}" must carry deprecation metadata.`);
    }
    return Object.freeze({ ...spec });
}
