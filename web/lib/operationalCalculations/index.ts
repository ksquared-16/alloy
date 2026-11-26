/**
 * Operational Calculations — the first-class platform registry of governed
 * operational calculations.
 *
 * This is the public surface of the four frozen layers:
 *   Definition → Handler → Runtime → Result
 *
 * V1 realizes the registration substrate (the registry admits code-owned
 * handlers, not only OIP metric keys) and the first reference family, Resource
 * Requirements & Capacity, over the existing pure resolvers — changing no
 * production behavior, migrating no consumer, and emitting no verdict.
 *
 * Governing architecture (frozen):
 *   docs/sprints/07_2026/operational-calculations-architecture/
 */

// ---- Result (the typed operational truth) ----
export type {
    OperationalCalculationResult,
    OperationalCalculationValue,
    OperationalCalculationResultKind,
    OperationalCalculationFamily,
    CalculationResolutionStatus,
    CalculationScope,
    CalculationScopeType,
    CalculationEffective,
    CalculationConfigVersion,
    CalculationTierRef,
    CapacityLimitingFactor,
    RequirementValue,
    CapacityValue,
} from "@/lib/operationalCalculations/resultContract";
export { defaultConfigVersion, CALCULATION_RESULT_KINDS } from "@/lib/operationalCalculations/resultContract";

// ---- Definition + Handler (the governed unit and the code that computes) ----
export type {
    OperationalCalculationDefinition,
    OperationalCalculationHandler,
    PureHandler,
    OipHandler,
    HandlerComputation,
    CalculationRuleShape,
    CalculationEffectiveTimeMode,
    OperationalCalculationConsumer,
    OperationalCalculationLifecycle,
    OperationalCalculationDeprecation,
} from "@/lib/operationalCalculations/definition";
export { defineOperationalCalculation, SUPPORTED_RULE_SHAPES } from "@/lib/operationalCalculations/definition";

// ---- Runtime (resolution against config + facts + injected clock) ----
export type { CalculationClock, ResolveCalculationOptions } from "@/lib/operationalCalculations/runtime";
export { resolveCalculation } from "@/lib/operationalCalculations/runtime";

// ---- Registry (the catalog of Definitions) ----
export {
    isKnownCalculationKey,
    getOperationalCalculationDefinition,
    findOperationalCalculationDefinition,
    listOperationalCalculationDefinitions,
    listOperationalCalculationDefinitionsByFamily,
    listOperationalCalculationDefinitionsByConsumer,
} from "@/lib/operationalCalculations/registry";

// ---- Configuration event propagation (Phase 4) ----
export {
    OPERATIONAL_CALCULATION_CONFIG_CHANGED_EVENT,
    OPERATIONAL_CALCULATION_CONFIG_EVENT_SCHEMA_VERSION,
    affectedCalculationKeysFor,
} from "@/lib/operationalCalculations/propagation/types";
export type {
    CalculationConfigRuleType,
    CalculationConfigChangeKind,
} from "@/lib/operationalCalculations/propagation/types";
export {
    buildCalculationConfigChangedEvent,
    emitCalculationConfigChanged,
} from "@/lib/operationalCalculations/propagation/configChangeEvents";
export type { CalculationConfigChangeInput } from "@/lib/operationalCalculations/propagation/configChangeEvents";
export {
    calculationResultInvalidatedBy,
    changeScopeContains,
    effectiveWindowCoversAsOf,
    selectInvalidated,
} from "@/lib/operationalCalculations/propagation/invalidation";
export type {
    CalculationConfigChange,
    CalculationResultCoordinate,
} from "@/lib/operationalCalculations/propagation/invalidation";

// ---- The first reference family ----
export type {
    ResourceRequirementRequest,
    CapacityCalculationRequest,
} from "@/lib/operationalCalculations/families/resourceRequirementsAndCapacity";
export {
    RESOURCE_AND_CAPACITY_DEFINITIONS,
    RESOURCE_REQUIRED_STAFF,
    RESOURCE_RATIO,
    CAPACITY_ROOM_BINDING,
    CAPACITY_REMAINING,
} from "@/lib/operationalCalculations/families/resourceRequirementsAndCapacity";
