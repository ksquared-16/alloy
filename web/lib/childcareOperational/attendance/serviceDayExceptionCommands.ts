/**
 * The operator commands that author a service-day exception.
 *
 * ── WHAT AN OPERATOR ACTUALLY DOES ──
 *
 *   "Emma is off sick today."                    → markChildAway
 *   "Finn is on holiday Mon–Fri next week."      → markChildAway (a window)
 *   "Actually Finn is back on Thursday."         → reviseChildAway (shorter window)
 *   "Cancel that holiday, he'll be in."          → withdrawChildAway
 *   "I picked the wrong child."                  → correctChildAway
 *   "We're shut on the 25th."                    → closeOperatingGrain
 *   "Toddler Room is shut on Tuesday."           → closeOperatingGrain (group grain)
 *   "We're opening after all."                   → reopenOperatingGrain
 *
 * There is no Absence record, no closure table and no schedule mutation behind
 * any of them. Each is one authored expectation about what is expected, and the
 * committed schedule underneath is untouched — which is what lets "she came in
 * anyway" stay visible instead of overwriting the plan.
 *
 * ── WHY WITHDRAWAL IS A REVISION, NOT A CANCELLATION ──
 *
 * Changing a future plan is a REVISION: the intent was validly held and has now
 * changed. `cancel` types a `cancellation`, which the resolver fails closed on —
 * so cancelling a holiday would make that child's day undeterminable rather than
 * ordinary, and the roster would show `unknown` where it should show a normal
 * expected child. A withdrawal is therefore a revision of the same lineage whose
 * predicate now says the child IS expected present. The history reads correctly:
 * we intended her away, then we intended her here.
 *
 * A `correction` is the different act, and the distinction is load-bearing: a
 * correction says the expectation was NEVER validly held — the wrong child, a
 * typo, a duplicate. Revision re-plans the future; correction unwinds a mistake.
 *
 * ── THESE BUILDERS ARE PURE ──
 *
 * They construct the frozen tuple and nothing else: no IO, no clock, no identity.
 * The org, the actor and the authorization arrive server-side
 * (`authorServiceDayException`), so a caller can never author as someone else.
 */

import {
    ATTENDANCE_EXPECTATION_PURPOSE,
    ATTENDANCE_SUBJECT_KINDS,
    SERVICE_DAY_PREDICATES,
    serviceDayValidWindow,
} from "@/lib/childcareOperational/attendance/serviceDayExpectations";
import type { AuthoringInput } from "@/lib/operationalExpectations/intake/authoringTypes";

/**
 * The fact-types whose appearance can change what this expectation is worth.
 * A child arriving is precisely the event that makes "expected away" interesting,
 * so it is declared rather than left for a consumer to guess.
 */
const SERVICE_DAY_FOOTPRINT_FACT_TYPES = ["child_attendance_event"] as const;

/** Grains that can be closed. A child is not a grain and cannot be "closed". */
export type ClosableGrainKind = typeof ATTENDANCE_SUBJECT_KINDS.site | typeof ATTENDANCE_SUBJECT_KINDS.operationalGroup;

export type ServiceDayDateRange = {
    /** First service date the exception covers (YYYY-MM-DD). */
    fromDate: string;
    /** Last service date it covers, inclusive. Defaults to `fromDate`. */
    toDate?: string | null;
};

type CommonAuthoring = {
    idempotencyKey: string;
    /** The authenticated actor, resolved server-side. Blank only when `authority` is supplied. */
    actorUserId: string;
    /** Operator-chosen reason. Free text belongs in `note`, not here. */
    reasonKey: string;
    /** Optional operator note carried with the authored intent. */
    note?: string | null;
    /**
     * An explicit Authority facet, for authors who are not staff users.
     *
     * A family submitting through a bounded link is not an org user and has no
     * `actorUserId` to name, but the thing they author is the SAME service-day
     * vocabulary — so they come through these same builders rather than a
     * parallel set that could drift from this one. Only the authority differs,
     * because only the authority IS different.
     *
     * Omitted, the actor is named as the authority exactly as before.
     */
    authority?: AuthoringInput["authority"];
};

/** The inclusive day range expressed as one half-open valid-time window. */
function windowFor(range: ServiceDayDateRange): { validFrom: string; validTo: string } {
    const from = serviceDayValidWindow(range.fromDate);
    const to = serviceDayValidWindow((range.toDate ?? "").trim() || range.fromDate);
    if (Date.parse(to.validTo) < Date.parse(from.validTo)) {
        throw new Error("toDate must be on or after fromDate");
    }
    // `validTo` is the exclusive end of the LAST covered day, so a single day is
    // a 24h window and Mon–Fri runs to Saturday morning. Ending at the last day's
    // START would silently exclude the final day of every holiday.
    return { validFrom: from.validFrom, validTo: to.validTo };
}

/**
 * Who is asserting this.
 *
 * A blank actor with no explicit authority would produce the authority key
 * `user:`, which names nobody while looking like it names someone — an
 * unattributable row in a ledger whose entire purpose is attribution. These
 * builders are pure and already throw on an impossible date range; this is the
 * same class of caller mistake.
 */
function authorityFor(common: CommonAuthoring): AuthoringInput["authority"] {
    if (common.authority) return common.authority;
    const actor = String(common.actorUserId ?? "").trim();
    if (!actor) {
        throw new Error("an authoring actor or an explicit authority is required");
    }
    return { authorityKey: `user:${actor}`, authorClass: "human" };
}

function conditionFor(predicateShape: string, common: CommonAuthoring): AuthoringInput["condition"] {
    const params: Record<string, unknown> = { reason_key: common.reasonKey };
    const note = (common.note ?? "").trim();
    if (note) params.note = note;
    return { typeKey: ATTENDANCE_EXPECTATION_PURPOSE, predicateShape, params };
}

function tuple(args: {
    verb: AuthoringInput["verb"];
    modality: AuthoringInput["modality"];
    predicateShape: string;
    subjectKind: string;
    subjectId: string;
    range: ServiceDayDateRange;
    common: CommonAuthoring;
    predecessorId?: string | null;
}): AuthoringInput {
    const { validFrom, validTo } = windowFor(args.range);
    return {
        idempotencyKey: args.common.idempotencyKey,
        verb: args.verb,
        // The actor is named as the authority. That is deliberately an INDIVIDUAL
        // rather than a governed authority key, so the authoring RPC resolves no
        // held authority and the act lands `proposed` — Attendance does not get to
        // grant itself binding force by choosing a grander-sounding key.
        //
        // The same reasoning covers a supplied authority: it names WHO asserted
        // this, never how much force the assertion carries.
        authority: authorityFor(args.common),
        modality: args.modality,
        subjects: [{ kind: args.subjectKind, ref: args.subjectId }],
        condition: conditionFor(args.predicateShape, args.common),
        temporalFrame: { kind: "window", validFrom, validTo },
        footprint: { factTypes: [...SERVICE_DAY_FOOTPRINT_FACT_TYPES] },
        predecessorId: args.predecessorId ?? null,
    };
}

/**
 * "Emma is off sick today" / "Finn is on holiday next week".
 *
 * `intended`, never `prohibited`: nobody forbids a child from attending, and a
 * child who turns up anyway must read as an unexpected arrival rather than as the
 * violation of a rule.
 */
export function markChildAway(
    params: CommonAuthoring & { childId: string; range: ServiceDayDateRange },
): AuthoringInput {
    return tuple({
        verb: "create",
        modality: "intended",
        predicateShape: SERVICE_DAY_PREDICATES.childAway,
        subjectKind: ATTENDANCE_SUBJECT_KINDS.child,
        subjectId: params.childId,
        range: params.range,
        common: params,
    });
}

/** "The holiday now ends on Thursday" — same intent, changed shape. */
export function reviseChildAway(
    params: CommonAuthoring & { childId: string; range: ServiceDayDateRange; predecessorId: string },
): AuthoringInput {
    return tuple({
        verb: "revise",
        modality: "intended",
        predicateShape: SERVICE_DAY_PREDICATES.childAway,
        subjectKind: ATTENDANCE_SUBJECT_KINDS.child,
        subjectId: params.childId,
        range: params.range,
        common: params,
        predecessorId: params.predecessorId,
    });
}

/**
 * "Cancel the holiday — he'll be in after all."
 *
 * A revision whose predicate now says the child is expected present. The word the
 * operator uses is "cancel"; the act is not a platform `cancellation`, because
 * the plan was validly held right up until it changed.
 */
export function withdrawChildAway(
    params: CommonAuthoring & { childId: string; range: ServiceDayDateRange; predecessorId: string },
): AuthoringInput {
    return tuple({
        verb: "revise",
        modality: "intended",
        predicateShape: SERVICE_DAY_PREDICATES.childExpectedPresent,
        subjectKind: ATTENDANCE_SUBJECT_KINDS.child,
        subjectId: params.childId,
        range: params.range,
        common: params,
        predecessorId: params.predecessorId,
    });
}

/**
 * "That was the wrong child" — the expectation was never validly held.
 *
 * Typed as a `correction`, which is a different thing from a revision and stays
 * different all the way down: a consumer replaying the lineage must be able to
 * tell "we changed our mind" from "this was never true".
 */
export function correctChildAway(
    params: CommonAuthoring & { childId: string; range: ServiceDayDateRange; predecessorId: string },
): AuthoringInput {
    return tuple({
        verb: "correct",
        modality: "intended",
        predicateShape: SERVICE_DAY_PREDICATES.childExpectedPresent,
        subjectKind: ATTENDANCE_SUBJECT_KINDS.child,
        subjectId: params.childId,
        range: params.range,
        common: params,
        predecessorId: params.predecessorId,
    });
}

/**
 * "We are shut on the 25th" — authored ONCE against the grain that is not
 * operating, whether that is the whole site or a single room.
 *
 * `prohibited` is the accurate modality here and the only place Attendance uses
 * it: a site genuinely MUST NOT operate on a holiday. That is an obligation on
 * the organisation, unlike a child's plan.
 *
 * No per-child rows are written. The projection applies the one closure to
 * whoever the committed schedule expected, so moving or withdrawing the closure
 * is one act rather than a hundred.
 */
export function closeOperatingGrain(
    params: CommonAuthoring & { grainKind: ClosableGrainKind; grainId: string; range: ServiceDayDateRange },
): AuthoringInput {
    return tuple({
        verb: "create",
        modality: "prohibited",
        predicateShape: SERVICE_DAY_PREDICATES.grainClosed,
        subjectKind: params.grainKind,
        subjectId: params.grainId,
        range: params.range,
        common: params,
    });
}

/** "We're opening after all" — the obligation not to operate is revised away. */
export function reopenOperatingGrain(
    params: CommonAuthoring & {
        grainKind: ClosableGrainKind;
        grainId: string;
        range: ServiceDayDateRange;
        predecessorId: string;
    },
): AuthoringInput {
    return tuple({
        verb: "revise",
        // Reopening imposes no obligation — it is an intention to operate, so the
        // deontic modality would be wrong on the way back.
        modality: "intended",
        predicateShape: SERVICE_DAY_PREDICATES.grainOpen,
        subjectKind: params.grainKind,
        subjectId: params.grainId,
        range: params.range,
        common: params,
        predecessorId: params.predecessorId,
    });
}
