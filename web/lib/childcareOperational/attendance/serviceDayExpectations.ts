/**
 * Attendance's reading of Operational Expectations for one service day.
 *
 * This is the ADAPTER: the query seam is domain-neutral and returns expectations
 * about subjects; this file is where "a prohibition on a site for this date"
 * becomes "the centre is closed" and "a prohibition on a child" becomes "known
 * away". The meaning lives here because Attendance owns it — the ledger owns
 * storage, lineage and effectivity, not what a closure means for a roster.
 *
 * ── THE THREE TRUTHS STAY SEPARATE ──
 *
 *   committed schedule      what normally happens          (schedule_assignments)
 *   effective expectations  what is known to differ        (this file's input)
 *   observed facts          what physically happened       (child_attendance_events)
 *
 * This file interprets the middle one and is deliberately incapable of asserting
 * the third. It returns an INTERPRETATION of expectation, never a presence state:
 * `knownAway` says nobody expects Emma today, and says nothing about whether she
 * walked through the door. Thread 3's fold still owns that, and observed facts
 * win — see `applyObservedPresence`.
 *
 * ── WHY CLOSURE IS NOT N CHILD ABSENCES ──
 *
 * A closure is authored ONCE against the grain that is actually not operating: a
 * site, or an operational group. Fanning it out into one expectation per child
 * would put the same truth in as many rows as there are children, none of which
 * is the fact, and all of which would need correcting together when the closure
 * moved. The projection applies the single closure to whoever was scheduled.
 */

import type {
    EffectiveExpectationForSubject,
    UnresolvedExpectationLineage,
} from "@/lib/operationalExpectations/query/effectiveExpectationsForWindow";

/** The purpose Attendance authors under. Ratified in the expectations owner. */
export const ATTENDANCE_EXPECTATION_PURPOSE = "attendance.service_day_exception" as const;

/** Subject kinds Attendance authors and reads. */
export const ATTENDANCE_SUBJECT_KINDS = {
    child: "child",
    site: "site",
    operationalGroup: "operational_group",
} as const;

/**
 * How a service day is interpreted for one child, BEFORE observed facts.
 *
 * `unknown` is a real answer, not a missing one: it means a lineage failed closed
 * and we cannot say. Treating that as `normal` would quietly assert a child is
 * expected when the ledger could not tell us.
 */
export type ExpectedInterpretation = "normal" | "known_away" | "closed" | "unknown";

export type ChildServiceDayExpectation = {
    childId: string;
    interpretation: ExpectedInterpretation;
    /** Operator-facing reason, when the authored expectation carried one. */
    reasonKey: string | null;
    /** For a closure: the grain that is not operating. */
    closedSubjectKind: string | null;
    closedSubjectId: string | null;
    /** The authored expectation this came from, for lineage/audit. */
    expectationId: string | null;
};

/** A prohibition is the modality that means "not operating / not attending". */
const PROHIBITED = "prohibited";

function reasonOf(condition: Record<string, unknown>): string | null {
    const r = condition?.reason_key ?? condition?.reasonKey;
    return typeof r === "string" && r.trim() ? r.trim() : null;
}

/**
 * Interpret one service day for the scheduled children at a site.
 *
 * `scheduledChildIds` is who the committed schedule expects — Thread 3's
 * expansion, unchanged. This layer only ever REINTERPRETS that set; it cannot add
 * a child nobody scheduled, which is what keeps vacation from silently becoming
 * an enrolment.
 */
export function interpretServiceDay(input: {
    siteLocationId: string;
    scheduledChildIds: readonly string[];
    /** Committed placement group per child, for group-closure resolution. */
    groupByChildId?: ReadonlyMap<string, string | null>;
    effective: readonly EffectiveExpectationForSubject[];
    unresolved?: readonly UnresolvedExpectationLineage[];
}): ChildServiceDayExpectation[] {
    const prohibitions = input.effective.filter((e) => e.modality === PROHIBITED);

    const siteClosure = prohibitions.find(
        (e) => e.subjectKind === ATTENDANCE_SUBJECT_KINDS.site && e.subjectId === input.siteLocationId,
    );

    const groupClosureById = new Map<string, EffectiveExpectationForSubject>();
    for (const e of prohibitions) {
        if (e.subjectKind === ATTENDANCE_SUBJECT_KINDS.operationalGroup) groupClosureById.set(e.subjectId, e);
    }

    const childAwayById = new Map<string, EffectiveExpectationForSubject>();
    for (const e of prohibitions) {
        if (e.subjectKind === ATTENDANCE_SUBJECT_KINDS.child) childAwayById.set(e.subjectId, e);
    }

    const unresolvedChildren = new Set(
        (input.unresolved ?? [])
            .filter((u) => u.subjectKind === ATTENDANCE_SUBJECT_KINDS.child)
            .map((u) => u.subjectId),
    );

    return input.scheduledChildIds.map((childId) => {
        // Closure first: if the centre is not operating, nobody is expected —
        // that is true regardless of any individual plan, and stating it as a
        // closure rather than an absence is what keeps a holiday from reading as
        // hundreds of children who failed to turn up.
        if (siteClosure) {
            return {
                childId,
                interpretation: "closed",
                reasonKey: reasonOf(siteClosure.condition),
                closedSubjectKind: ATTENDANCE_SUBJECT_KINDS.site,
                closedSubjectId: input.siteLocationId,
                expectationId: siteClosure.expectationId,
            };
        }

        const group = input.groupByChildId?.get(childId) ?? null;
        const groupClosure = group ? groupClosureById.get(group) : undefined;
        if (groupClosure) {
            return {
                childId,
                interpretation: "closed",
                reasonKey: reasonOf(groupClosure.condition),
                closedSubjectKind: ATTENDANCE_SUBJECT_KINDS.operationalGroup,
                closedSubjectId: group,
                expectationId: groupClosure.expectationId,
            };
        }

        const away = childAwayById.get(childId);
        if (away) {
            return {
                childId,
                interpretation: "known_away",
                reasonKey: reasonOf(away.condition),
                closedSubjectKind: null,
                closedSubjectId: null,
                expectationId: away.expectationId,
            };
        }

        if (unresolvedChildren.has(childId)) {
            return {
                childId,
                interpretation: "unknown",
                reasonKey: null,
                closedSubjectKind: null,
                closedSubjectId: null,
                expectationId: null,
            };
        }

        return {
            childId,
            interpretation: "normal",
            reasonKey: null,
            closedSubjectKind: null,
            closedSubjectId: null,
            expectationId: null,
        };
    });
}

/** What the operator finally sees for a child on a service day. */
export type ServiceDayState =
    | "here_now"
    | "checked_out"
    | "known_away"
    | "closed"
    | "not_arrived"
    | "attended_despite_plan"
    | "unknown";

/**
 * Combine expectation with observed presence. OBSERVED FACTS WIN.
 *
 * The whole architecture is tested by one case: a child on authored vacation who
 * turns up anyway. She is physically here, so `here_now` is the answer for
 * occupancy — but reporting only that would erase the fact that nobody expected
 * her, which is exactly the signal an operator needs. So the state is
 * `attended_despite_plan`: present for every physical purpose, and visibly not
 * what was planned. The vacation expectation is untouched; reality did not make
 * the plan retrospectively false.
 */
export function applyObservedPresence(
    expectation: ChildServiceDayExpectation,
    observed: "present" | "checked_out" | "absent" | "no_record",
): ServiceDayState {
    if (observed === "present") {
        return expectation.interpretation === "known_away" || expectation.interpretation === "closed"
            ? "attended_despite_plan"
            : "here_now";
    }
    if (observed === "checked_out") return "checked_out";

    // No physical observation. Expectation decides how the silence reads — this
    // is the difference between "nobody expected her" and "she is missing".
    switch (expectation.interpretation) {
        case "known_away":
            return "known_away";
        case "closed":
            return "closed";
        case "unknown":
            return "unknown";
        default:
            return observed === "absent" ? "known_away" : "not_arrived";
    }
}

/**
 * Whether a child should raise unexplained missing-arrival attention.
 *
 * Only `not_arrived` does. A known-away child, a closed day and a child who
 * turned up are all explained; an unresolved lineage is NOT explained, but it is
 * also not a missing arrival, so it is surfaced separately rather than filed as
 * one — a data problem must not masquerade as an operational one.
 */
export function raisesMissingArrivalAttention(state: ServiceDayState): boolean {
    return state === "not_arrived";
}
