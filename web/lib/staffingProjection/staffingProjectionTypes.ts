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

/**
 * What Availability says about a person during one segment.
 *
 * Three answers, and the third is not a shade of the second. A person with no
 * Availability record at all is UNKNOWN: the platform was never told when they
 * can work, and reading that as "unavailable" would quietly remove half a
 * workforce from every candidate list, while reading it as "available" would
 * offer people who may be unreachable. Both are worse than saying so.
 */
export type SegmentAvailability = "available" | "unavailable" | "unknown";

export type PlannedStaffRef = StaffRef & {
    source: PlannedPlaceSource;
    /** What Availability says about them during this segment. */
    availability: SegmentAvailability;
    /** Why they are unavailable, when an exception said so. */
    unavailableReason?: string | null;
    /** Set only when Coverage moved them; the room the Assignment would have given. */
    baselineRoomLocationId?: string | null;
    /**
     * The Coverage allocation that placed them, when Coverage did.
     *
     * Carried because a surface that can show a Coverage allocation must be able to
     * CHANGE or CANCEL it, and the canonical commands take the allocation id. Without
     * it the only way to act on what is on screen would be to look the row up again,
     * which is how a surface ends up querying the table it is supposed to be reading
     * a projection of.
     */
    coverageId?: string | null;
};

/**
 * Someone the operator could plan into this segment.
 *
 * The pool is the site's own staff, not a filtered shortlist: a gap that offers
 * nobody because nobody authored Availability is a dead end, and the operator
 * knowing their own people is not a reason to hide them. Every candidate carries
 * the facts that make the decision — what Availability says, whether they are
 * already planned somewhere in this interval, and where their Assignment puts
 * them — and carries no opinion. Nobody is ranked and nobody is scored.
 */
export type CandidateStaffRef = StaffRef & {
    availability: SegmentAvailability;
    unavailableReason?: string | null;
    /** The room they are already planned in during this segment, if any. */
    plannedInRoomLocationId?: string | null;
    plannedElsewhere: boolean;
    baselineRoomLocationId: string | null;
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
    | { code: "planned_but_unavailable"; names: string[] }
    | { code: "availability_not_recorded"; names: string[] }
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
    /** Everyone planned here, including anyone who cannot actually work it. */
    plannedStaff: PlannedStaffRef[];
    /**
     * The planned staff who can actually work this interval.
     *
     * The plan is never erased to make the arithmetic convenient — `plannedStaff`
     * still names everyone the schedule put here. This is the subset that counts
     * toward the requirement, which is why a call-out opens a gap without
     * deleting anyone's Coverage.
     */
    effectivePlannedStaff: PlannedStaffRef[];
    /** The site's staff, with the facts an operator needs to pick one. */
    candidateStaff: CandidateStaffRef[];
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
