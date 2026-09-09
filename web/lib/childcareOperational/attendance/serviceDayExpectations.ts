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

/*
 * ── WHY ABSENCE IS `intended` AND CLOSURE IS `prohibited` ──
 *
 * The first draft authored both as `prohibited`. That is wrong for a child, and
 * Scenario F is what proves it: Emma is marked away and then attends anyway. Under
 * `prohibited` — a deontic "must not" — her arrival is a VIOLATION of a standing
 * expectation, and the ledger would be recording that a child broke a rule by
 * coming to nursery. Nobody prohibited Emma from attending; somebody said she was
 * not expected.
 *
 * `intended` is the modality for what SHOULD or WILL be without obligation. A
 * plan that reality overtakes is just a plan that changed, which is exactly the
 * semantics Scenario F needs.
 *
 * A closure is genuinely deontic. The site MUST NOT operate on a holiday — that
 * is an obligation on the organisation, not an expectation about it — so closure
 * keeps `prohibited`.
 *
 * This also resolves the standing question cleanly for the common case: an
 * `intended` expectation imposes no obligation, so consuming it at `proposed`
 * standing asserts nothing about binding force. See STANDING CONTRACT below.
 */
/** A child is EXPECTED away — intent, never an obligation on the child. */
const CHILD_AWAY_MODALITY = "intended";
/** An operating grain is prohibited from operating — genuinely deontic. */
const CLOSURE_MODALITY = "prohibited";

/**
 * ── THE STANDING CONTRACT ──
 *
 * Attendance consumes an activated service-day expectation REGARDLESS of its
 * standing, and that is a decision rather than an oversight.
 *
 * Standing is binding FORCE (Law 6) — whether an expectation obliges anyone. It
 * is not a confidence score and not a workflow status. The service-day projection
 * asks a different question: "is this child expected today?" An operator saying
 * Emma is sick has changed what the centre expects whether or not anyone is
 * thereby obliged, so gating the roster on standing would leave a known-away
 * child showing as an unexplained missing arrival — the exact defect Thread 4
 * exists to remove.
 *
 * Two consequences are deliberate:
 *
 *   - Absence is `intended`, which imposes no obligation at ANY standing, so the
 *     question barely arises for the high-frequency case.
 *   - Closure is `prohibited` and deontic. Per the expectations architecture an
 *     authorized human holding the authority is "self-ratifying within authority"
 *     and should land `binding`; today the intake clamps every act to `proposed`
 *     because Wave C · C2 was never wired to `resolveAuthorityToStanding`. That is
 *     an Operational Expectations gap, NOT something Attendance should route
 *     around by inventing a standing.
 *
 * `expectationStandingIsConsumable` is the single place that decision lives, and
 * its tests fail if someone narrows it silently — so a future standing change
 * cannot quietly stop closures working.
 */
export function expectationStandingIsConsumable(standing: string): boolean {
    // Every standing the ledger can express is consumable for INTERPRETATION.
    // Deliberately total: a new standing must be considered here explicitly
    // rather than defaulting to "ignored", which would silently drop truth.
    return standing === "proposed" || standing === "binding" || standing === "model";
}

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
    const consumable = input.effective.filter((e) => expectationStandingIsConsumable(e.standing));

    const closures = consumable.filter((e) => e.modality === CLOSURE_MODALITY);
    const awayIntents = consumable.filter((e) => e.modality === CHILD_AWAY_MODALITY);

    const siteClosure = closures.find(
        (e) => e.subjectKind === ATTENDANCE_SUBJECT_KINDS.site && e.subjectId === input.siteLocationId,
    );

    const groupClosureById = new Map<string, EffectiveExpectationForSubject>();
    for (const e of closures) {
        if (e.subjectKind === ATTENDANCE_SUBJECT_KINDS.operationalGroup) groupClosureById.set(e.subjectId, e);
    }

    const childAwayById = new Map<string, EffectiveExpectationForSubject>();
    for (const e of awayIntents) {
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
