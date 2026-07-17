/**
 * Scheduling Operational Calculation Registry — the canonical catalog of the
 * Scheduling family within the Operational Calculation truth runtime.
 *
 * Each entry NAMES the existing canonical resolver that owns its math. Nothing
 * here computes; the descriptors are declarative data. This registry is additive
 * and lives entirely in the truth runtime (`lib/childcareOperational/*`). It does
 * NOT touch, extend, or import:
 *   - the analytics / OIP scalar registry (Operational Intelligence), or
 *   - the frozen operational-expectations authored ledger (Operational Expectations).
 *
 * Doctrine: docs/platform/core/operational-calculations.md
 */

import type {
    SchedulingCalculation,
    SchedulingCalculationConsumer,
    SchedulingCalculationKey,
} from "@/lib/childcareOperational/calculations/types";

const CALCULATIONS: Record<SchedulingCalculationKey, SchedulingCalculation> = {
    "scheduling.required_staff": {
        key: "scheduling.required_staff",
        family: "scheduling",
        label: "Required staff (ratio)",
        questionAnswered: "How many staff are required to stay ratio-compliant for a room's child count?",
        grains: ["room_date"],
        unit: "staff_count",
        resolver: {
            module: "lib/childcareOperational/capacity/resolveRatio.ts",
            export: "resolveRequiredStaffForChildren",
        },
        logicOwner: "childcareOperational/capacity ratio resolver (wraps config/ratioRules tiers)",
        dependencies: [],
        requiredInputs: ["childcare_ratio_rules", "childcare_ratio_rule_tiers"],
        refreshStrategy: "live",
        consumers: ["operational_expectations_api", "actual_compliance_api"],
        version: 1,
        determinism: "pure_deterministic",
        status: "active",
        testingStrategy:
            "Parity: canonical resolveRequiredStaffForChildren equals config/ratioRules primitive across a tier/count matrix.",
    },
    "scheduling.ratio_constrained_capacity": {
        key: "scheduling.ratio_constrained_capacity",
        family: "scheduling",
        label: "Ratio-constrained capacity",
        questionAnswered: "What is the highest child count a room's ratio tiers permit?",
        grains: ["room_date", "room"],
        unit: "seat_count",
        resolver: {
            module: "lib/childcareOperational/capacity/resolveRatio.ts",
            export: "resolveRatio",
        },
        logicOwner: "childcareOperational/capacity ratio resolver (most-restrictive mixed-age)",
        dependencies: [],
        requiredInputs: ["childcare_ratio_rules", "childcare_ratio_rule_tiers"],
        refreshStrategy: "live",
        consumers: ["operational_config_rules_api"],
        version: 1,
        determinism: "pure_deterministic",
        status: "active",
        testingStrategy: "Snapshot parity vs resolveRatio.ratioConstrainedCapacity fixtures.",
    },
    "scheduling.binding_capacity": {
        key: "scheduling.binding_capacity",
        family: "scheduling",
        label: "Binding room capacity",
        questionAnswered: "What is the binding seat limit for a room on a date (min of physical, licensed, operational, ratio-limited)?",
        grains: ["room_date"],
        unit: "seat_count",
        resolver: {
            module: "lib/childcareOperational/config/roomConfigResolvers.ts",
            export: "buildRoomConfigResolvers",
        },
        logicOwner: "childcareOperational/config capacity resolver (resolveCapacityBreakdown.binding)",
        dependencies: ["scheduling.ratio_constrained_capacity"],
        requiredInputs: ["childcare_capacity_rules", "childcare_ratio_rules", "childcare_ratio_rule_tiers"],
        refreshStrategy: "live",
        consumers: ["actual_compliance_api", "operational_expectations_api"],
        version: 1,
        determinism: "pure_deterministic",
        status: "active",
        testingStrategy: "Snapshot parity vs resolveCapacityBinding fixtures; min-clamp boundary cases.",
    },
    "scheduling.expected_occupancy": {
        key: "scheduling.expected_occupancy",
        family: "scheduling",
        label: "Expected occupancy by room/date",
        questionAnswered: "How many children are expected in a room on a date from committed schedules?",
        grains: ["room_date"],
        unit: "child_count",
        resolver: {
            module: "lib/childcareOperational/expectations/scheduleExpectationCore.ts",
            export: "aggregateExpectedOccupancyByRoomDate",
        },
        logicOwner: "childcareOperational/expectations schedule projection (derived, non-authoritative)",
        dependencies: [],
        requiredInputs: ["operational_agreements", "child_placements", "schedule_assignments", "schedule_patterns"],
        refreshStrategy: "live",
        consumers: ["operational_expectations_api", "expected_vs_actual_api"],
        version: 1,
        determinism: "pure_deterministic",
        status: "active",
        testingStrategy: "Golden-snapshot parity vs buildScheduleExpectations occupancy entries.",
    },
    "scheduling.expected_staffing": {
        key: "scheduling.expected_staffing",
        family: "scheduling",
        label: "Expected staffing by room/date",
        questionAnswered: "How many staff will a room's expected occupancy require on a date?",
        grains: ["room_date"],
        unit: "staff_count",
        resolver: {
            module: "lib/childcareOperational/expectations/scheduleExpectationCore.ts",
            export: "computeExpectedStaffingByRoomDate",
        },
        logicOwner: "childcareOperational/expectations schedule projection (derived, non-authoritative)",
        dependencies: ["scheduling.required_staff", "scheduling.expected_occupancy"],
        requiredInputs: ["operational_agreements", "child_placements", "schedule_assignments", "schedule_patterns", "childcare_ratio_rules"],
        refreshStrategy: "live",
        consumers: ["operational_expectations_api"],
        version: 1,
        determinism: "pure_deterministic",
        status: "active",
        testingStrategy: "Golden-snapshot parity vs buildScheduleExpectations staffing entries.",
    },
    "scheduling.actual_occupancy": {
        key: "scheduling.actual_occupancy",
        family: "scheduling",
        label: "Actual occupancy by room/date",
        questionAnswered: "How many children were actually observed in a room on a date?",
        grains: ["room_date"],
        unit: "child_count",
        resolver: {
            module: "lib/childcareOperational/attendance/actualCompliance.ts",
            export: "aggregateActualOccupancyByRoomDate",
        },
        logicOwner: "childcareOperational/attendance actual compliance (attendance fold facts)",
        dependencies: [],
        requiredInputs: ["child_attendance_events"],
        refreshStrategy: "live",
        consumers: ["actual_compliance_api"],
        version: 1,
        determinism: "pure_deterministic",
        status: "active",
        testingStrategy: "Golden-snapshot parity vs buildActualComplianceReadModel occupancy entries.",
    },
    "scheduling.actual_staffing_gap": {
        key: "scheduling.actual_staffing_gap",
        family: "scheduling",
        label: "Actual staffing gap / compliance",
        questionAnswered: "For a room's actual occupancy, how does required staff compare to staff on hand, and is it over capacity?",
        grains: ["room_date"],
        unit: "staff_count",
        resolver: {
            module: "lib/childcareOperational/attendance/actualCompliance.ts",
            export: "computeActualCompliance",
        },
        logicOwner: "childcareOperational/attendance actual compliance",
        dependencies: ["scheduling.required_staff", "scheduling.actual_occupancy", "scheduling.binding_capacity"],
        requiredInputs: ["child_attendance_events", "childcare_ratio_rules", "childcare_capacity_rules"],
        refreshStrategy: "live",
        consumers: ["actual_compliance_api"],
        version: 1,
        determinism: "pure_deterministic",
        status: "active",
        testingStrategy: "Golden-snapshot parity vs buildActualComplianceReadModel compliance entries + warnings.",
    },
    "scheduling.attendance_adherence": {
        key: "scheduling.attendance_adherence",
        family: "scheduling",
        label: "Attendance adherence (expected vs actual)",
        questionAnswered: "How closely did actual attendance match the expected roster (matched / expected / present)?",
        grains: ["room_date"],
        unit: "adherence_counts",
        resolver: {
            module: "lib/childcareOperational/attendance/expectedVsActual.ts",
            export: "diffExpectedVsActual",
        },
        logicOwner: "childcareOperational/attendance expected-vs-actual diff",
        dependencies: ["scheduling.expected_occupancy"],
        requiredInputs: ["operational_agreements", "child_placements", "schedule_assignments", "schedule_patterns", "child_attendance_events"],
        refreshStrategy: "live",
        consumers: ["expected_vs_actual_api"],
        version: 1,
        determinism: "pure_deterministic",
        status: "active",
        testingStrategy: "Golden-snapshot parity vs diffExpectedVsActual counts and variances.",
    },
    "scheduling.days_per_week_policy": {
        key: "scheduling.days_per_week_policy",
        family: "scheduling",
        label: "Days-per-week policy compliance",
        questionAnswered: "Does a child's scheduled days-per-week fall within the configured policy?",
        grains: ["site"],
        unit: "ratio_flags",
        resolver: {
            module: "lib/childcareOperational/config/scheduleRules.ts",
            export: "evaluateDaysPolicy",
        },
        logicOwner: "childcareOperational/config schedule rules",
        dependencies: [],
        requiredInputs: ["childcare_schedule_rules", "schedule_patterns"],
        refreshStrategy: "live",
        consumers: ["operational_expectations_api"],
        version: 1,
        determinism: "pure_deterministic",
        status: "active",
        testingStrategy: "Parity vs evaluateDaysPolicy within/below/above fixtures.",
    },
};

const CALCULATION_KEYS = new Set<string>(Object.keys(CALCULATIONS));

export function isKnownSchedulingCalculationKey(key: string): key is SchedulingCalculationKey {
    return CALCULATION_KEYS.has(key);
}

export function getSchedulingCalculation(key: SchedulingCalculationKey): SchedulingCalculation {
    return CALCULATIONS[key];
}

export function findSchedulingCalculation(key: string): SchedulingCalculation | null {
    return isKnownSchedulingCalculationKey(key) ? CALCULATIONS[key] : null;
}

const CALCULATIONS_LIST: readonly SchedulingCalculation[] = Object.freeze(Object.values(CALCULATIONS));

export function listSchedulingCalculations(): readonly SchedulingCalculation[] {
    return CALCULATIONS_LIST;
}

export function listSchedulingCalculationsByConsumer(
    consumer: SchedulingCalculationConsumer,
): readonly SchedulingCalculation[] {
    return Object.freeze(CALCULATIONS_LIST.filter((c) => c.consumers.includes(consumer)));
}
