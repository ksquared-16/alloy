/**
 * Assembles the Schedule-derived Expectations read model (L3) from committed
 * operational rows + first-class config rules. DERIVED, non-authoritative — no
 * persistence. Pure function (the DB wrapper lives in fetchScheduleExpectations).
 */

import {
    aggregateExpectedOccupancyByRoomDate,
    aggregatePlannedOccupancyByRoomDate,
    computeExpectedStaffingByRoomDate,
    expandExpectedAttendance,
    expandPlannedAttendance,
    type ExpectedAttendanceEntry,
    type ExpectedOccupancyEntry,
    type ExpectedStaffingEntry,
    type OperationalAgreementInput,
    type OperationalAssignmentInput,
    type OperationalPlacementInput,
    type OperationalProposedAssignmentInput,
    type PlannedAttendanceEntry,
    type PlannedOccupancyEntry,
    type SchedulePatternInput,
} from "@/lib/childcareOperational/expectations/scheduleExpectationCore";
import {
    isRuleEffectiveOn,
    ruleMatchesContext,
} from "@/lib/childcareOperational/config/resolveConfigRule";
import { resolveCapacityBreakdown } from "@/lib/childcareOperational/config/capacityRules";
import { ratioLimitedCapacity, type RatioTier } from "@/lib/childcareOperational/config/ratioRules";
import { buildRoomConfigResolvers } from "@/lib/childcareOperational/config/roomConfigResolvers";
import {
    evaluateDaysPolicy,
    isAgeGroupEligible,
    isScheduleTypeEligible,
    resolveScheduleRule,
} from "@/lib/childcareOperational/config/scheduleRules";
import type {
    ChildcareConfigRuleBundle,
} from "@/lib/childcareOperational/config/childcareConfigRuleService";
import type {
    ConfigRuleScopeContext,
} from "@/lib/childcareOperational/config/configRuleTypes";

export type ExpectationWarningCode =
    | "missing_placement_room"
    | "missing_age_group"
    | "capacity_exceeded"
    | "schedule_type_ineligible"
    | "age_group_ineligible"
    | "pattern_weekday_outside_operating_window"
    | "days_policy_violation";

export type ExpectationWarning = {
    code: ExpectationWarningCode;
    detail: string;
    date?: string;
    agreementId?: string;
    customerMemberId?: string;
    roomLocationId?: string | null;
};

export type ScheduleExpectationReadModel = {
    expectedAttendance: ExpectedAttendanceEntry[];
    expectedOccupancyByRoomDate: ExpectedOccupancyEntry[];
    expectedStaffingByRoomDate: ExpectedStaffingEntry[];
    warnings: ExpectationWarning[];
    /**
     * Planned (Proposed) attendance/occupancy — a distinct, non-authoritative signal.
     * NEVER merged into `expectedAttendance` / `expectedOccupancyByRoomDate` and never
     * contributes to staffing or capacity warnings; those stay committed-only.
     */
    plannedAttendance: PlannedAttendanceEntry[];
    plannedOccupancyByRoomDate: PlannedOccupancyEntry[];
};

export type BuildScheduleExpectationsInput = {
    dateStart: string;
    dateEnd: string;
    agreements: readonly OperationalAgreementInput[];
    placements: readonly OperationalPlacementInput[];
    assignments: readonly OperationalAssignmentInput[];
    patternsById: ReadonlyMap<string, SchedulePatternInput>;
    config: ChildcareConfigRuleBundle;
    /** Optional age-group resolution by room/program (e.g. classroom_age_group). */
    ageGroupByRoomLocationId?: Readonly<Record<string, string | null>>;
    ageGroupByProgramCategoryId?: Readonly<Record<string, string | null>>;
    /** Proposed (planning-only) assignments — surfaced as `planned*`, never as attendance truth. */
    proposedAssignments?: readonly OperationalProposedAssignmentInput[];
};

export function buildScheduleExpectations(
    input: BuildScheduleExpectationsInput
): ScheduleExpectationReadModel {
    const { config } = input;

    const expectedAttendance = expandExpectedAttendance({
        dateStart: input.dateStart,
        dateEnd: input.dateEnd,
        agreements: input.agreements,
        placements: input.placements,
        assignments: input.assignments,
        patternsById: input.patternsById,
    });

    // Room -> resolution context (site/program/age-group) + tier/capacity closures.
    const { contextForRoom, resolveTiers } = buildRoomConfigResolvers({
        agreements: input.agreements,
        placements: input.placements,
        config,
        ageGroupByRoomLocationId: input.ageGroupByRoomLocationId,
        ageGroupByProgramCategoryId: input.ageGroupByProgramCategoryId,
    });

    const expectedOccupancyByRoomDate = aggregateExpectedOccupancyByRoomDate(expectedAttendance);
    const expectedStaffingByRoomDate = computeExpectedStaffingByRoomDate(
        expectedOccupancyByRoomDate,
        resolveTiers
    );

    const warnings = deriveWarnings({
        expectedAttendance,
        expectedOccupancyByRoomDate,
        config,
        contextForRoom,
        resolveTiers,
    });

    // Planning signal — computed independently, never folded into committed truth above.
    const plannedAttendance = expandPlannedAttendance({
        dateStart: input.dateStart,
        dateEnd: input.dateEnd,
        proposedAssignments: input.proposedAssignments ?? [],
        patternsById: input.patternsById,
    });
    const plannedOccupancyByRoomDate = aggregatePlannedOccupancyByRoomDate(plannedAttendance);

    return {
        expectedAttendance,
        expectedOccupancyByRoomDate,
        expectedStaffingByRoomDate,
        warnings,
        plannedAttendance,
        plannedOccupancyByRoomDate,
    };
}

function deriveWarnings(args: {
    expectedAttendance: readonly ExpectedAttendanceEntry[];
    expectedOccupancyByRoomDate: readonly ExpectedOccupancyEntry[];
    config: ChildcareConfigRuleBundle;
    contextForRoom: (roomLocationId: string) => ConfigRuleScopeContext;
    resolveTiers: (roomLocationId: string, date: string) => RatioTier[];
}): ExpectationWarning[] {
    const { expectedAttendance, expectedOccupancyByRoomDate, config, contextForRoom, resolveTiers } =
        args;
    const warnings: ExpectationWarning[] = [];
    const seen = new Set<string>();
    const once = (key: string): boolean => {
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    };

    // Capacity warnings (per room/date), binding = min(physical, licensed, operational, ratio-limited).
    for (const occ of expectedOccupancyByRoomDate) {
        const context = contextForRoom(occ.roomLocationId);
        const ratioLimited = ratioLimitedCapacity(resolveTiers(occ.roomLocationId, occ.date)) || null;
        const breakdown = resolveCapacityBreakdown(config.capacityRules, context, occ.date, ratioLimited);
        if (breakdown.binding != null && occ.childCount > breakdown.binding) {
            warnings.push({
                code: "capacity_exceeded",
                detail: `expected ${occ.childCount} exceeds capacity ${breakdown.binding}`,
                date: occ.date,
                roomLocationId: occ.roomLocationId,
            });
        }
    }

    // Per-attendance eligibility, missing room, and operating-window coverage.
    const daysPerWeekByAgreement = new Map<string, Set<number>>();
    for (const e of expectedAttendance) {
        const set = daysPerWeekByAgreement.get(e.agreementId) ?? new Set<number>();
        set.add(e.weekday);
        daysPerWeekByAgreement.set(e.agreementId, set);

        if (!e.roomLocationId && once(`missing_room:${e.agreementId}`)) {
            warnings.push({
                code: "missing_placement_room",
                detail: "expected attendance with no operational placement room on this date",
                agreementId: e.agreementId,
                customerMemberId: e.customerMemberId,
                date: e.date,
            });
        }

        const ageGroupKey = e.roomLocationId ? contextForRoom(e.roomLocationId).ageGroupKey : null;
        if (e.roomLocationId && ageGroupKey == null && once(`missing_age_group:${e.agreementId}`)) {
            warnings.push({
                code: "missing_age_group",
                detail: "placed child has no resolvable age group (program category / classroom band)",
                agreementId: e.agreementId,
                customerMemberId: e.customerMemberId,
                roomLocationId: e.roomLocationId,
            });
        }

        const context: ConfigRuleScopeContext = {
            siteLocationId: e.siteLocationId,
            programCategoryId: e.programCategoryId,
            roomLocationId: e.roomLocationId,
            ageGroupKey,
        };
        const scheduleRule = resolveScheduleRule(config.scheduleRules, context, e.date);
        if (
            !isScheduleTypeEligible(scheduleRule, e.scheduleTypeKey) &&
            once(`sched_type:${e.agreementId}`)
        ) {
            warnings.push({
                code: "schedule_type_ineligible",
                detail: `schedule type ${e.scheduleTypeKey} not eligible for this scope`,
                agreementId: e.agreementId,
                customerMemberId: e.customerMemberId,
            });
        }
        if (
            !isAgeGroupEligible(scheduleRule, context.ageGroupKey) &&
            once(`age_group:${e.agreementId}`)
        ) {
            warnings.push({
                code: "age_group_ineligible",
                detail: `age group ${context.ageGroupKey ?? "unknown"} not eligible for this scope`,
                agreementId: e.agreementId,
                customerMemberId: e.customerMemberId,
            });
        }

        // Operating-window coverage: only flag when windows exist for the scope but none cover this weekday.
        const windowsForContext = config.operatingWindows.filter(
            (w) => ruleMatchesContext(w, context) && isRuleEffectiveOn(w, e.date)
        );
        if (windowsForContext.length > 0) {
            const covered = windowsForContext.some((w) => w.weekday === e.weekday);
            if (!covered && once(`op_window:${e.siteLocationId}:${e.weekday}`)) {
                warnings.push({
                    code: "pattern_weekday_outside_operating_window",
                    detail: `weekday ${e.weekday} is outside configured operating windows`,
                    date: e.date,
                    roomLocationId: e.roomLocationId,
                });
            }
        }
    }

    // Days-per-week policy per agreement.
    for (const [agreementId, weekdays] of daysPerWeekByAgreement) {
        const sample = expectedAttendance.find((e) => e.agreementId === agreementId);
        if (!sample) continue;
        const context: ConfigRuleScopeContext = {
            siteLocationId: sample.siteLocationId,
            programCategoryId: sample.programCategoryId,
            roomLocationId: sample.roomLocationId,
            ageGroupKey: sample.roomLocationId ? contextForRoom(sample.roomLocationId).ageGroupKey : null,
        };
        const scheduleRule = resolveScheduleRule(config.scheduleRules, context, sample.date);
        const policy = evaluateDaysPolicy(scheduleRule, weekdays.size);
        if (!policy.withinPolicy && once(`days_policy:${agreementId}`)) {
            warnings.push({
                code: "days_policy_violation",
                detail: policy.belowMin
                    ? `scheduled ${weekdays.size} days/week below minimum`
                    : `scheduled ${weekdays.size} days/week above maximum`,
                agreementId,
                customerMemberId: sample.customerMemberId,
            });
        }
    }

    return warnings;
}
