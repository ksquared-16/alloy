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

/** The purpose Attendance authors under. Activated in the expectations owner. */
export const ATTENDANCE_EXPECTATION_PURPOSE = "attendance.service_day_exception" as const;

/**
 * The predicate shapes Attendance authors under that purpose. The Condition's
 * shape is fixed by the Expectation Type; the author supplies parameters.
 */
export const SERVICE_DAY_PREDICATES = {
    /** A child is expected away for the day. Parameter: `reason_key`. */
    childAway: "child_away",
    /** A withdrawn or corrected plan: the child IS expected in after all. */
    childExpectedPresent: "child_expected_present",
    /** An operating grain is not operating. Parameter: `reason_key`. */
    grainClosed: "operating_grain_closed",
    /** A withdrawn closure: the grain is operating after all. */
    grainOpen: "operating_grain_open",
} as const;

/**
 * The purposes whose vocabulary this projection is willing to interpret.
 *
 * Deliberately a closed set, and deliberately just ours. A `prohibited`
 * expectation on a site authored by some other domain, for some other reason,
 * would otherwise read as "the nursery is closed" and suppress the missing-arrival
 * signal for every child there — meaning imported from a vocabulary Attendance
 * does not own. When another domain has a real closure to express, adding its
 * purpose here is one deliberate, reviewable line.
 */
export const INTERPRETED_EXPECTATION_PURPOSES: ReadonlySet<string> = new Set([
    ATTENDANCE_EXPECTATION_PURPOSE,
]);

/**
 * The valid-time window of one service day.
 *
 * Authoring and querying MUST agree on this, or an expectation authored for
 * Friday is effective at no coordinate the roster ever asks about — a bug that
 * looks exactly like "the feature does nothing". One function, both callers.
 *
 * The day is bounded in UTC, matching how the roster already addresses a service
 * date. Sites in other zones are a known convergence debt, recorded rather than
 * half-fixed here: a partial timezone correction on one side of this pair would
 * reintroduce precisely the drift the shared helper exists to prevent.
 */
export function serviceDayValidWindow(serviceDate: string): { validFrom: string; validTo: string } {
    const start = new Date(`${serviceDate}T00:00:00Z`);
    if (Number.isNaN(start.getTime())) throw new Error(`invalid service date: ${serviceDate}`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { validFrom: start.toISOString(), validTo: end.toISOString() };
}

/** The valid-time coordinate the roster asks about for a service day. */
export function serviceDayAsOf(serviceDate: string): { validTime: string } {
    return { validTime: serviceDayValidWindow(serviceDate).validFrom };
}

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
 *   - Closure is `prohibited` and deontic, and WOULD self-ratify to `binding` if
 *     its author held the authority. Standing is not clamped in TypeScript: the
 *     authoring RPC recomputes it authoritatively from
 *     `resolve_held_operational_authority`, so a holder of a governed authority
 *     binds and everyone else lands `proposed`. Attendance authors under
 *     `user:<id>`, which names an individual rather than a governed authority, so
 *     nothing self-ratifies today.
 *
 * Which organisation roles should hold governed operational authority — for site
 * closures, schedule exceptions, staffing constraints and other cross-domain
 * intent — is a GOVERNANCE decision owned by Operational Expectations and Access
 * & Roles. Attendance must not answer it by inventing an authority key, and must
 * not need rewriting when it is answered: the day such a role exists, this same
 * command path starts producing stronger standing through the ledger's existing
 * authority machinery, and nothing below changes.
 *
 * `expectationStandingIsConsumable` is the single place that decision lives, and
 * its tests fail if someone narrows it silently — so a future standing change
 * cannot quietly stop closures working.
 */
/**
 * The standings this projection consumes — published so that narrowing it is a
 * visible, reviewable act rather than an edit inside a predicate.
 */
export const EXPECTATION_STANDINGS_CONSUMED: readonly string[] = ["proposed", "binding", "model"];

export function expectationStandingIsConsumable(standing: string): boolean {
    // Every standing the ledger can express is consumable for INTERPRETATION.
    // Deliberately total: a new standing must be considered here explicitly
    // rather than defaulting to "ignored", which would silently drop truth.
    return EXPECTATION_STANDINGS_CONSUMED.includes(standing);
}

/**
 * ── THE ELIGIBILITY CONTRACT ──
 *
 * What makes an authored expectation operationally relevant to a service day:
 *
 *   correct org              — the query seam's tenancy filter, twice over
 *   valid lineage resolution — the ratified resolver; unresolved never means absent
 *   effective temporal window— the resolver, against the service-day coordinate
 *   authorized purpose       ┐
 *   supported subject        │ this function — the part Attendance owns, because
 *   supported modality       │ it is the part that turns ledger meaning into
 *   matching predicate       ┘ roster meaning
 *
 * Standing is deliberately NOT in that list. It is ledger-owned metadata about
 * binding force across every platform consumer; this projection answers the
 * narrower question of how today reads for this child. Gating on it would make
 * every operator-authored absence and closure silently disappear from the roster
 * — see the standing contract above.
 *
 * The three seam-owned conditions are named here rather than re-implemented:
 * duplicating tenancy or lineage semantics is how two consumers end up
 * disagreeing about which expectation is effective.
 */
export type ExpectationRelevance =
    | { relevant: true; kind: "child_away" | "grain_closed" }
    | { relevant: false; reason: "unconsumable_standing" | "foreign_purpose" | "unsupported_semantics" };

export function serviceDayExpectationRelevance(e: {
    subjectKind: string;
    modality: string;
    condition: Record<string, unknown>;
    standing: string;
}): ExpectationRelevance {
    // Checked first and answered explicitly, so a reader can see that standing is
    // considered and deliberately not used to exclude anything the ledger can say.
    if (!expectationStandingIsConsumable(e.standing)) {
        return { relevant: false, reason: "unconsumable_standing" };
    }
    if (!isInterpretablePurpose(e.condition)) return { relevant: false, reason: "foreign_purpose" };

    const predicate = predicateOf(e.condition);
    if (
        e.modality === CLOSURE_MODALITY &&
        predicate === SERVICE_DAY_PREDICATES.grainClosed &&
        (e.subjectKind === ATTENDANCE_SUBJECT_KINDS.site ||
            e.subjectKind === ATTENDANCE_SUBJECT_KINDS.operationalGroup)
    ) {
        return { relevant: true, kind: "grain_closed" };
    }
    if (
        e.modality === CHILD_AWAY_MODALITY &&
        predicate === SERVICE_DAY_PREDICATES.childAway &&
        e.subjectKind === ATTENDANCE_SUBJECT_KINDS.child
    ) {
        return { relevant: true, kind: "child_away" };
    }
    return { relevant: false, reason: "unsupported_semantics" };
}

/**
 * The operator-facing reason, read from where the frozen grammar actually puts
 * it: the author supplies PARAMETERS to a fixed predicate shape, so the reason
 * lives at `condition.params.reason_key`. The top-level spellings are accepted
 * too — a row hand-authored before the grammar settled should still explain
 * itself rather than silently lose its reason.
 */
function reasonOf(condition: Record<string, unknown>): string | null {
    const params = condition?.params;
    const fromParams =
        params != null && typeof params === "object" && !Array.isArray(params)
            ? (params as Record<string, unknown>).reason_key ?? (params as Record<string, unknown>).reasonKey
            : undefined;
    const r = fromParams ?? condition?.reason_key ?? condition?.reasonKey;
    return typeof r === "string" && r.trim() ? r.trim() : null;
}

/** Is this expectation written in the vocabulary Attendance owns? */
function isInterpretablePurpose(condition: Record<string, unknown>): boolean {
    const typeKey = condition?.typeKey ?? condition?.type_key;
    return typeof typeKey === "string" && INTERPRETED_EXPECTATION_PURPOSES.has(typeKey);
}

/** The predicate shape an expectation instantiates, or "" when it names none. */
function predicateOf(condition: Record<string, unknown>): string {
    const p = condition?.predicateShape ?? condition?.predicate_shape;
    return typeof p === "string" ? p : "";
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
    /*
     * ONE eligibility decision per expectation, taken in one place.
     *
     * Both the modality AND the predicate must match. The modality alone would
     * read a withdrawal — an `intended` expectation saying the child IS coming —
     * as another absence, so cancelling a holiday would leave the child marked
     * away forever. Matching the predicate is what makes a lineage able to say
     * the opposite of what it first said.
     */
    const closures: EffectiveExpectationForSubject[] = [];
    const awayIntents: EffectiveExpectationForSubject[] = [];
    for (const e of input.effective) {
        const relevance = serviceDayExpectationRelevance(e);
        if (!relevance.relevant) continue;
        (relevance.kind === "grain_closed" ? closures : awayIntents).push(e);
    }

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
