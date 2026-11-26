/**
 * Assignment proposal readiness — computed gaps from configured requirement composition.
 * Does not persist readiness status. Tenant config selects which factors apply;
 * code evaluates them consistently against participation + proposal + committed facts.
 */

import {
    EFFECTIVE_DATE_LABELS,
    resolvePreferredWeekdays,
    resolveRequestedDaysPerWeek,
    resolveRequestedStart,
} from "@/lib/enrollment/effectiveDateAuthority";

export type AssignmentReadinessFactorKey =
    | "requested_days_per_week"
    | "preferred_weekdays"
    | "requested_start"
    | "site"
    | "program"
    | "room"
    | "proposed_schedule"
    | "assignment_start"
    | "tuition_plan"
    | "quote_generated"
    | "quote_accepted"
    | "enrollment_paperwork";

export type AssignmentProposalFacts = {
    processInstanceMetadata?: Record<string, unknown> | null;
    locationId?: string | null;
    programCategoryId?: string | null;
    roomLocationId?: string | null;
    scheduleType?: string | null;
    /** Proposed OA exists (commitment_kind=proposed) or draft weekdays/schedule present. */
    hasProposedSchedule?: boolean;
    /** Operator-supplied proposed assignment effective date (may differ from Requested Start). */
    proposedAssignmentStart?: string | null;
    tuitionPlanId?: string | null;
    hasQuoteSnapshot?: boolean;
    quoteAccepted?: boolean;
    enrollmentPaperworkComplete?: boolean;
};

export type AssignmentReadinessGap = {
    factor: AssignmentReadinessFactorKey;
    label: string;
    message: string;
};

export type AssignmentReadinessResult = {
    ready: boolean;
    gaps: AssignmentReadinessGap[];
};

const FACTOR_LABELS: Record<AssignmentReadinessFactorKey, string> = {
    requested_days_per_week: EFFECTIVE_DATE_LABELS.requestedDaysPerWeek,
    preferred_weekdays: EFFECTIVE_DATE_LABELS.preferredDays,
    requested_start: EFFECTIVE_DATE_LABELS.requestedStart,
    site: "Site",
    program: "Program",
    room: "Room",
    proposed_schedule: EFFECTIVE_DATE_LABELS.proposedSchedule,
    assignment_start: "Assignment start",
    tuition_plan: "Tuition plan",
    quote_generated: "Quote / estimate",
    quote_accepted: "Quote accepted",
    enrollment_paperwork: "Enrollment paperwork",
};

function present(v: unknown): boolean {
    if (v == null) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (typeof v === "number") return Number.isFinite(v) && v > 0;
    if (typeof v === "boolean") return v;
    if (Array.isArray(v)) return v.length > 0;
    return true;
}

export function evaluateAssignmentProposalReadiness(args: {
    requiredFactors: readonly AssignmentReadinessFactorKey[];
    facts: AssignmentProposalFacts;
}): AssignmentReadinessResult {
    const meta = args.facts.processInstanceMetadata ?? null;
    const requestedDays = resolveRequestedDaysPerWeek(meta);
    const preferredDays = resolvePreferredWeekdays(meta);
    const requestedStart = resolveRequestedStart({ processInstanceMetadata: meta });

    const values: Record<AssignmentReadinessFactorKey, boolean> = {
        requested_days_per_week: requestedDays != null && requestedDays > 0,
        preferred_weekdays: preferredDays.length > 0,
        requested_start: present(requestedStart),
        site: present(args.facts.locationId ?? meta?.location_id),
        program: present(args.facts.programCategoryId ?? meta?.program_category_id),
        room: present(args.facts.roomLocationId ?? meta?.program_room_cohort_key),
        proposed_schedule:
            Boolean(args.facts.hasProposedSchedule)
            || present(args.facts.scheduleType ?? meta?.schedule_type)
            || preferredDays.length > 0,
        assignment_start: present(args.facts.proposedAssignmentStart),
        tuition_plan: present(args.facts.tuitionPlanId ?? meta?.tuition_plan_id),
        quote_generated: Boolean(args.facts.hasQuoteSnapshot),
        quote_accepted: Boolean(args.facts.quoteAccepted),
        enrollment_paperwork: Boolean(args.facts.enrollmentPaperworkComplete),
    };

    const gaps: AssignmentReadinessGap[] = [];
    for (const factor of args.requiredFactors) {
        if (values[factor]) continue;
        const label = FACTOR_LABELS[factor];
        gaps.push({
            factor,
            label,
            message: `${label} is required before Enrollment can advance.`,
        });
    }

    return { ready: gaps.length === 0, gaps };
}

/**
 * Map lifecycle rule ids used in tenant requirement config onto assignment readiness factors.
 * Unknown rule ids are ignored (other readiness systems own them).
 */
export function assignmentFactorFromLifecycleRuleId(ruleId: string): AssignmentReadinessFactorKey | null {
    switch (ruleId) {
        case "child:requested_days_per_week":
            return "requested_days_per_week";
        case "child:preferred_weekdays":
            return "preferred_weekdays";
        case "child:start_date":
            return "requested_start";
        case "child:desired_schedule":
            return "proposed_schedule";
        case "child:classroom":
            return "room";
        case "child:tuition_plan":
            return "tuition_plan";
        case "child:quote_accepted":
            return "quote_accepted";
        case "opportunity:enrollment_packet":
            return "enrollment_paperwork";
        case "child:program_interest":
            return "program";
        case "opportunity:location":
            return "site";
        default:
            return null;
    }
}
