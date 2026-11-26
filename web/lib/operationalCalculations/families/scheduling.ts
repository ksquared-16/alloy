/**
 * Scheduling & Occupancy — the second registered Operational Calculation family
 * (Phase 6, reconciled into Registry V1).
 *
 * Four Definitions, each wrapping an ALREADY-BUILT, ALREADY-PURE, ALREADY-TESTED
 * childcare read-model. This module registers governance over existing
 * computation; it adds no new math and changes no resolver:
 *
 *   - occupancy.expected          → wraps `aggregateExpectedOccupancyByRoomDate`
 *   - occupancy.actual            → wraps `aggregateActualOccupancyByRoomDate`
 *   - scheduling.expected_staffing→ wraps `computeExpectedStaffingByRoomDate`
 *   - scheduling.actual_staffing  → wraps `computeActualStaffingByRoomDate`
 *
 * These four supersede the parallel `lib/childcareOperational/calculations`
 * descriptor catalog (Phase 6 pre-reconciliation). The ratio/capacity members of
 * that catalog are NOT re-registered here — they are already the canonical
 * `resource.required_staff` / `resource.ratio` / `capacity.room_binding` in the
 * Resource Requirements & Capacity family, whose Definitions declare `scheduling`
 * as a consumer.
 *
 * Deliberately deferred (NOT registered here) so no judgment leaks into a
 * calculation result: actual staffing GAP / over-capacity, attendance adherence
 * variance, and days-per-week policy. Those compare a fact against an
 * expectation — that comparison is Operational Expectations, not a calculation.
 * A future wave registers the pure facts and moves the comparison to evaluation.
 *
 * Discipline (same as the resource/capacity family):
 *   - Typed values, never a forced scalar-as-base: occupancy is `scalar`,
 *     staffing is `requirement`.
 *   - Absence of a room/date entry is a resolved 0 (no children expected/observed),
 *     never null — the read-models only emit rooms/dates that have children.
 *   - A child count beyond the highest tier makes the staffing result `incomplete`
 *     with the flag carried, never silently trusted.
 *   - NO verdicts: no compliant / breached / over_capacity / understaffed here.
 *
 * Pure: no IO. Callers compute the batch read-model and pass its entries in the
 * request; the handler selects the room/date and shapes the typed value.
 */

import {
    defineOperationalCalculation,
    type HandlerComputation,
    type OperationalCalculationDefinition,
} from "@/lib/operationalCalculations/definition";
import type {
    CalculationResolutionStatus,
    RequirementValue,
} from "@/lib/operationalCalculations/resultContract";

const EXPECTATION_ENGINE_VERSION = "childcare.scheduleExpectationCore@1.0.0";
const ATTENDANCE_ENGINE_VERSION = "childcare.actualCompliance@1.0.0";
const CONTRACT_VERSION = "1.0";

/** A resolved scalar occupancy value (reserved `scalar` value kind). */
type ScalarValue = { kind: "scalar"; value: number | null };

/** Structural occupancy entry — matches Expected/Actual OccupancyEntry. */
type OccupancyEntryLike = { roomLocationId: string; date: string; childCount: number };

/** Structural staffing entry — matches Expected/Actual StaffingEntry. */
type StaffingEntryLike = {
    roomLocationId: string;
    date: string;
    childCount: number;
    requiredStaff: number;
    exceedsDefinedTiers: boolean;
};

/** Request for the two `occupancy.*` calculations: the batch entries + a target room/date. */
export type OccupancyCalculationRequest = {
    entries: readonly OccupancyEntryLike[];
    roomLocationId: string;
    date: string;
};

/** Request for the two staffing calculations: the batch entries + a target room/date. */
export type StaffingCalculationRequest = {
    entries: readonly StaffingEntryLike[];
    roomLocationId: string;
    date: string;
};

function selectEntry<T extends { roomLocationId: string; date: string }>(
    entries: readonly T[],
    roomLocationId: string,
    date: string,
): T | undefined {
    return entries.find((e) => e.roomLocationId === roomLocationId && e.date === date);
}

/**
 * Shared adapter for the two `occupancy.*` calculations: select the room/date
 * entry from the batch read-model and shape a `scalar` count. A room/date the
 * read-model did not emit has no expected/observed children — a resolved 0.
 */
function evaluateOccupancy(request: OccupancyCalculationRequest): HandlerComputation<ScalarValue> {
    const entry = selectEntry(request.entries, request.roomLocationId, request.date);
    return {
        status: "resolved",
        value: { kind: "scalar", value: entry ? entry.childCount : 0 },
        scope: { type: "room", id: request.roomLocationId },
        effective: { asOf: request.date },
        appliedRules: [],
        warnings: [],
    };
}

/**
 * Shared adapter for the two staffing calculations: select the room/date entry
 * and shape a `requirement` value (requiredStaff). `ratioConstrainedCapacity` is
 * null — this calculation answers "staff required for this occupancy", not the
 * ratio ceiling (that is `resource.ratio`). Beyond-tier counts are `incomplete`.
 */
function evaluateStaffing(request: StaffingCalculationRequest): HandlerComputation<RequirementValue> {
    const entry = selectEntry(request.entries, request.roomLocationId, request.date);
    const exceedsDefinedTiers = entry ? entry.exceedsDefinedTiers : false;
    const status: CalculationResolutionStatus = exceedsDefinedTiers ? "incomplete" : "resolved";
    return {
        status,
        value: {
            kind: "requirement",
            requiredStaff: entry ? entry.requiredStaff : 0,
            ratioConstrainedCapacity: null,
            appliedTier: null,
            exceedsDefinedTiers,
        },
        scope: { type: "room", id: request.roomLocationId },
        effective: { asOf: request.date },
        appliedRules: [],
        warnings: [],
    };
}

// ---- the four Definitions ----

export const OCCUPANCY_EXPECTED: OperationalCalculationDefinition<OccupancyCalculationRequest, ScalarValue> =
    defineOperationalCalculation({
        key: "occupancy.expected",
        family: "occupancy",
        purpose: "How many children are expected in this room on this date from committed schedules?",
        handler: {
            kind: "pure",
            ref: "childcareOperational/expectations/scheduleExpectationCore.aggregateExpectedOccupancyByRoomDate",
            engineVersion: EXPECTATION_ENGINE_VERSION,
            evaluate: evaluateOccupancy,
        },
        ruleShapes: ["schedule_derived"],
        scopes: ["room"],
        effectiveTime: "point_in_time",
        resultKind: "scalar",
        contractVersion: CONTRACT_VERSION,
        consumers: ["scheduling", "operational_expectations"],
        expectationBindable: true,
        logicOwner: "Childcare Operational — schedule projections",
        status: "active",
        testingStrategy:
            "Conformance vs aggregateExpectedOccupancyByRoomDate: room/date count; absent room/date ⇒ resolved 0.",
    });

export const OCCUPANCY_ACTUAL: OperationalCalculationDefinition<OccupancyCalculationRequest, ScalarValue> =
    defineOperationalCalculation({
        key: "occupancy.actual",
        family: "occupancy",
        purpose: "How many children were actually observed in this room on this date?",
        handler: {
            kind: "pure",
            ref: "childcareOperational/attendance/actualCompliance.aggregateActualOccupancyByRoomDate",
            engineVersion: ATTENDANCE_ENGINE_VERSION,
            evaluate: evaluateOccupancy,
        },
        ruleShapes: ["schedule_derived"],
        scopes: ["room"],
        effectiveTime: "point_in_time",
        resultKind: "scalar",
        contractVersion: CONTRACT_VERSION,
        consumers: ["scheduling", "attendance"],
        expectationBindable: true,
        logicOwner: "Childcare Operational — attendance facts",
        status: "active",
        testingStrategy:
            "Conformance vs aggregateActualOccupancyByRoomDate: distinct observed children; absent room/date ⇒ resolved 0.",
    });

export const SCHEDULING_EXPECTED_STAFFING: OperationalCalculationDefinition<
    StaffingCalculationRequest,
    RequirementValue
> = defineOperationalCalculation({
    key: "scheduling.expected_staffing",
    family: "scheduling",
    purpose: "How many staff will this room's expected occupancy require on this date?",
    handler: {
        kind: "pure",
        ref: "childcareOperational/expectations/scheduleExpectationCore.computeExpectedStaffingByRoomDate",
        engineVersion: EXPECTATION_ENGINE_VERSION,
        evaluate: evaluateStaffing,
    },
    ruleShapes: ["tiered_ratio", "fixed_ratio"],
    scopes: ["room"],
    effectiveTime: "point_in_time",
    resultKind: "requirement",
    contractVersion: CONTRACT_VERSION,
    consumers: ["scheduling", "operational_expectations"],
    expectationBindable: true,
    logicOwner: "Childcare Operational — schedule projections + ratio resolvers",
    status: "active",
    testingStrategy:
        "Conformance vs computeExpectedStaffingByRoomDate: requiredStaff for expected occupancy; beyond-tier ⇒ incomplete + flagged.",
});

export const SCHEDULING_ACTUAL_STAFFING: OperationalCalculationDefinition<
    StaffingCalculationRequest,
    RequirementValue
> = defineOperationalCalculation({
    key: "scheduling.actual_staffing",
    family: "scheduling",
    purpose: "How many staff does this room's actual occupancy require on this date?",
    handler: {
        kind: "pure",
        ref: "childcareOperational/attendance/actualCompliance.computeActualStaffingByRoomDate",
        engineVersion: ATTENDANCE_ENGINE_VERSION,
        evaluate: evaluateStaffing,
    },
    ruleShapes: ["tiered_ratio", "fixed_ratio"],
    scopes: ["room"],
    effectiveTime: "point_in_time",
    resultKind: "requirement",
    contractVersion: CONTRACT_VERSION,
    consumers: ["scheduling", "attendance"],
    expectationBindable: true,
    logicOwner: "Childcare Operational — attendance facts + ratio resolvers",
    status: "active",
    testingStrategy:
        "Conformance vs computeActualStaffingByRoomDate: requiredStaff for actual occupancy; beyond-tier ⇒ incomplete + flagged.",
});

/** The Scheduling & Occupancy family — the Phase 6 registration set. */
export const SCHEDULING_DEFINITIONS: readonly OperationalCalculationDefinition[] = [
    OCCUPANCY_EXPECTED,
    OCCUPANCY_ACTUAL,
    SCHEDULING_EXPECTED_STAFFING,
    SCHEDULING_ACTUAL_STAFFING,
] as OperationalCalculationDefinition[];
