/**
 * Scheduling Operational Calculation family — descriptor contract.
 *
 * This is a governed-descriptor layer inside the **Operational Calculation truth
 * runtime** (the canonical childcareOperational resolvers). It is deliberately
 * SEPARATE from two neighbours it must never be conflated with or coupled to:
 *
 *   - Operational Intelligence  (`lib/analytics/*`, `lib/metrics/*`) — the analytics
 *     layer. It wraps org/site-grained scalar OIP metrics. Scheduling facts are
 *     room/date-grained and structured, so they are NOT registered there.
 *   - Operational Expectations  (`lib/operationalExpectations/*`) — the frozen
 *     evaluation layer (authored ledger). A calculation measures what IS; it never
 *     asserts what SHOULD be and never carries a judgment/verdict. No import edge
 *     to that module may exist from this family.
 *
 * A Scheduling Calculation does NOT compute. It is a declarative descriptor that
 * NAMES the existing canonical resolver that owns the math (`resolver`), so the
 * math stays single-sourced and this layer can never fork it. Descriptors are data.
 *
 * Doctrine: docs/platform/core/operational-calculations.md
 */

/** The owning family. One family today; the type leaves room for siblings. */
export type OperationalCalculationFamily = "scheduling";

/** Stable identifiers for the Scheduling-family calculations. */
export type SchedulingCalculationKey =
    | "scheduling.required_staff"
    | "scheduling.ratio_constrained_capacity"
    | "scheduling.binding_capacity"
    | "scheduling.expected_occupancy"
    | "scheduling.expected_staffing"
    | "scheduling.actual_occupancy"
    | "scheduling.actual_staffing_gap"
    | "scheduling.attendance_adherence"
    | "scheduling.days_per_week_policy";

/**
 * Grain of a scheduling fact. The truth runtime is room/date-grained; a few
 * config-derived ceilings resolve at room grain independent of a date's roster.
 */
export type SchedulingCalculationGrain = "room_date" | "room" | "site";

/** Unit of the resolved value — drives presentation, never computation. */
export type SchedulingCalculationUnit =
    | "staff_count"
    | "child_count"
    | "seat_count"
    | "ratio_flags"
    | "adherence_counts";

/**
 * All family members are pure and deterministic (no DB / IO / mutation). The
 * field is explicit so "preserve deterministic runtime behavior" is a contract,
 * not an assumption.
 */
export type SchedulingCalculationDeterminism = "pure_deterministic";

export type SchedulingCalculationStatus = "active" | "draft" | "archived";

/**
 * Declared production consumer surfaces. Kept concrete (the live API routes /
 * server read-models) so a change to a calculation yields a precise impact list.
 */
export type SchedulingCalculationConsumer =
    | "operational_expectations_api"
    | "actual_compliance_api"
    | "expected_vs_actual_api"
    | "operational_config_rules_api";

/**
 * Points at the canonical resolver that owns the math. `module` is a repo-relative
 * path under `lib/`; `export` is the exported function name. An integrity test
 * imports each ref and asserts it resolves to a function, so a descriptor can
 * never name a resolver that does not exist (the analogue of the OIP registry's
 * `OipMetricKey` wrap-check).
 */
export type CanonicalResolverRef = {
    module: string;
    export: string;
};

/**
 * A governed Scheduling Calculation descriptor. Mirrors the governance vocabulary
 * of the Operational Calculation doctrine, adapted to the truth runtime (a named
 * canonical resolver instead of a wrapped `OipMetricKey`).
 */
export type SchedulingCalculation = {
    key: SchedulingCalculationKey;
    family: OperationalCalculationFamily;
    label: string;
    /** The operator question this fact answers, in one sentence. */
    questionAnswered: string;
    /** Supported grains. Must be non-empty. */
    grains: readonly SchedulingCalculationGrain[];
    /** Unit of the resolved value. */
    unit: SchedulingCalculationUnit;
    /** The canonical resolver that owns the math (single source of truth). */
    resolver: CanonicalResolverRef;
    /** Team / module accountable for the underlying math. */
    logicOwner: string;
    /** Other scheduling calculations this one composes. */
    dependencies: readonly SchedulingCalculationKey[];
    /** Source read-models / config the calculation depends on. */
    requiredInputs: readonly string[];
    /** Truth runtime is always live evaluation — no snapshot cadence, no persistence. */
    refreshStrategy: "live";
    /** Declared downstream production surfaces. */
    consumers: readonly SchedulingCalculationConsumer[];
    /** Contract version (semantics), bumped on a "what counts" change. */
    version: number;
    determinism: SchedulingCalculationDeterminism;
    status: SchedulingCalculationStatus;
    /** How correctness / parity is proven. */
    testingStrategy: string;
};
