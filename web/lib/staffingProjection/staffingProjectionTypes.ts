/**
 * The vocabulary of the time-aware staffing projection.
 *
 * Four different facts about one person are kept in four different fields, and
 * they are never folded together:
 *
 *   BASELINE   the Assignment says this is their room and these are their hours
 *   AVAILABLE  Availability says they could be asked to work then
 *   PLANNED    where they are actually expected to be — baseline, unless
 *              Coverage specialised that interval somewhere else
 *   ACTUAL     where Presence observed them
 *
 * Collapsing any pair loses a question an operator asks daily. "Available but not
 * planned" is the whole content of a solvable gap; merged into one supply number
 * it becomes a gap nobody can act on. "Planned but not present" is the difference
 * between a schedule problem and a this-morning problem.
 *
 * The same discipline applies to children: expected and actual are separate, and
 * neither is rewritten to match the other.
 */

import type { StaffingSufficiency } from "@/lib/scheduling/supply/staffingSufficiency";
import type { Hhmm, TimeInterval } from "@/lib/staffingProjection/staffingSegments";

/** Null `roomLocationId` means the site itself, not an unknown room. */
export const SITE_LEVEL_ROOM = null;

/** How a person came to be planned where they are planned. */
export type PlannedPlaceSource = "assignment" | "coverage";

/** A person in one segment, carrying the employment that makes them countable once. */
export type StaffRef = {
    employmentId: string;
    personId: string;
    displayName: string;
};

export type PlannedStaffRef = StaffRef & {
    source: PlannedPlaceSource;
    /** Set only when Coverage moved them; the room the Assignment would have given. */
    baselineRoomLocationId?: string | null;
};

/** A child expected in one segment. */
export type ChildRef = {
    customerMemberId: string;
    agreementId: string;
};

/**
 * Why a segment reads the way it does.
 *
 * Structured first and rendered second: a consumer that wants to act on
 * "available but not planned" should not have to parse a sentence, and a
 * consumer that wants to show a sentence should not have to invent one. Both
 * come from here, so two surfaces can never explain the same segment
 * differently.
 */
export type StaffingExplanationFact =
    | { code: "expected_children"; count: number }
    | { code: "expected_children_unknown_hours"; count: number }
    | { code: "actual_children"; count: number }
    | { code: "required_staff"; count: number }
    | { code: "required_unresolved"; reason: "no_ratio_tier_covers_occupancy" }
    | { code: "baseline_staff"; names: string[] }
    | { code: "planned_staff"; names: string[] }
    | { code: "available_not_planned"; names: string[] }
    | { code: "coverage_specialized"; names: string[] }
    | { code: "planned_not_present"; names: string[] }
    | { code: "present_not_planned"; names: string[] }
    | { code: "shortfall"; count: number }
    | { code: "no_demand" }
    | { code: "actuals_not_observed" };

export type StaffingExplanation = {
    facts: StaffingExplanationFact[];
    /** One deterministic sentence per fact, in the order above. */
    lines: string[];
};

/** One room (or the site itself) over one half-open segment. */
export type StaffingProjectionSegment = {
    date: string;
    siteLocationId: string;
    roomLocationId: string | null;
    roomName: string | null;
    start: Hhmm;
    end: Hhmm;

    expectedChildren: ChildRef[];
    expectedChildCount: number;
    /** Expected here on this date, but with no recorded hours — counted nowhere else. */
    expectedChildrenUnknownHours: ChildRef[];
    actualChildCount: number | null;

    baselineStaff: StaffRef[];
    availableStaff: StaffRef[];
    plannedStaff: PlannedStaffRef[];
    actualStaff: StaffRef[] | null;

    /** Null when no ratio tier covers this occupancy — never silently zero. */
    requiredStaff: number | null;
    /** Required against ACTUAL children. Null when actuals were not observed. */
    requiredStaffActual: number | null;

    plannedState: StaffingSufficiency;
    actualState: StaffingSufficiency;
    /** Planned shortfall in whole staff. Null when the requirement is unresolved. */
    shortfall: number | null;

    explanation: StaffingExplanation;
};

/** An input the projection could not read truthfully, named rather than dropped. */
export type StaffingProjectionUnknown =
    | { code: "assignment_hours_unknown"; assignmentId: string; personId: string }
    | { code: "child_hours_unknown"; assignmentId: string; customerMemberId: string }
    | { code: "assignment_type_unclassified"; assignmentId: string; personId: string }
    | { code: "ratio_unresolved"; roomLocationId: string | null }
    | { code: "actuals_not_observed"; date: string };

export type StaffingProjectionDay = {
    orgId: string;
    siteLocationId: string;
    date: string;
    /** Ascending, half-open, shared by every room so rooms are comparable. */
    boundaries: Hhmm[];
    segments: StaffingProjectionSegment[];
    /** Provenance: what the projection could not answer, and about what. */
    unknowns: StaffingProjectionUnknown[];
    /** False when nothing was observed for this date at all (a future day). */
    actualsObserved: boolean;
};

export type StaffingProjectionResult = {
    orgId: string;
    siteLocationId: string;
    dateStart: string;
    dateEnd: string;
    days: StaffingProjectionDay[];
};

export type { Hhmm, TimeInterval };
