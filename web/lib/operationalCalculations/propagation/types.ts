/**
 * Operational Calculation configuration-change propagation — shared pure types.
 *
 * Phase 4 (Configuration Event Propagation) completes the runtime substrate by
 * wiring calculation-related configuration authoring into the existing platform
 * event model. The propagation chain is:
 *
 *   Configuration  →  Event  →  Invalidation  →  Operational Calculation Runtime
 *
 * This module holds the pieces both the emit side (`configChangeEvents.ts`, which
 * touches the event layer) and the invalidation side (`invalidation.ts`, a pure
 * predicate) depend on — kept IO-free so the predicate never transitively imports
 * the event/Supabase layer.
 *
 * Governing architecture (frozen):
 *   docs/sprints/07_2026/operational-calculations-architecture/04-realization-plan.md §Part 6
 *
 * Pure constants + types + one pure mapping. No IO.
 */

/** The canonical event type for a calculation-relevant configuration change. */
export const OPERATIONAL_CALCULATION_CONFIG_CHANGED_EVENT = "operational_calculation_config_changed";

/** Payload schema version — bumped if the event payload shape changes. */
export const OPERATIONAL_CALCULATION_CONFIG_EVENT_SCHEMA_VERSION = 1;

/**
 * The calculation-config rule families this phase wires. Only the two that
 * parameterize the registered Resource Requirements & Capacity family — ratio
 * rules and capacity rules. (Operating windows and schedule rules feed the
 * Scheduling family, which is out of scope until Phase 6.)
 */
export type CalculationConfigRuleType = "ratio" | "capacity";

/** The authoring mutation kinds, matching the effective-dated versioning model. */
export type CalculationConfigChangeKind = "create" | "version" | "retire" | "void";

/**
 * Which registered calculation keys a change to a given rule type can invalidate.
 * Derived from the handlers' known inputs (not invented):
 *   - A **ratio** rule feeds required-staff and the ratio-limited ceiling, and
 *     the ratio-limited ceiling also participates in the capacity binding — so it
 *     can invalidate all four keys.
 *   - A **capacity** rule feeds only the capacity binding and remaining seats.
 */
export function affectedCalculationKeysFor(ruleType: CalculationConfigRuleType): readonly string[] {
    return ruleType === "ratio"
        ? ["resource.required_staff", "resource.ratio", "capacity.room_binding", "capacity.remaining"]
        : ["capacity.room_binding", "capacity.remaining"];
}
