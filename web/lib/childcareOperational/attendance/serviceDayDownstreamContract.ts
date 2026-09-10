/**
 * What downstream consumers may rely on, and what they must not.
 *
 * The service-day reading is about to acquire consumers that are not the roster:
 * billing wants to know whether a day was chargeable, parent-facing channels want
 * to know whether to say "not expected today", and occupancy/ratio work wants to
 * know who counts towards a room. Each of them can get the wrong answer in a
 * different way, so the contract is stated ONCE, in types, next to the projection
 * it constrains — rather than three times, differently, in three threads.
 *
 * This module is a CONTRACT, not a service. It holds no data and performs no IO.
 */

import type { ServiceDayState } from "@/lib/childcareOperational/attendance/serviceDayExpectations";

/**
 * ── 1. THE STANDING CONTRACT, STATED FOR CONSUMERS ──
 *
 * Every service-day expectation this product authors currently lands at
 * `proposed` standing, and the projection consumes it anyway. That is deliberate
 * and it is NOT a promise that the expectation binds anyone.
 *
 * Standing is binding FORCE — whether someone is obliged. The roster asks a
 * different question ("is this child expected today?"), and an operator's sick
 * call changes what the centre expects whether or not anyone is thereby obliged.
 *
 * The consequence for a downstream consumer is sharp:
 *
 *   SAFE      — using a reading to decide what to SHOW, whom to expect, whom to
 *               chase, what to tell a parent, whether a room is running.
 *   NOT SAFE  — using a reading as evidence that someone was OBLIGED. A planned
 *               absence at `proposed` standing is not a contractual notice
 *               period, not a waiver, and not consent to anything.
 *
 * A consumer that needs obligation must wait for the expectations owner to wire
 * Authority→Standing resolution (Wave C · C2). Until then a `proposed` closure
 * authored by an authorised manager is indistinguishable, in the data, from a
 * proposal — and no downstream decision may turn on the difference.
 */
export const SERVICE_DAY_STANDING_CONTRACT = {
    /** Every authored service-day expectation currently lands here. */
    authoredStanding: "proposed",
    /** Consumers may read the interpretation at any standing. */
    interpretationIgnoresStanding: true,
    /** No consumer may treat a reading as proof that anyone was obliged. */
    conveysObligation: false,
} as const;

/**
 * ── 2. WHAT A STATE DOES AND DOES NOT ASSERT ──
 *
 * The trap is `attended_despite_plan`. It is a PRESENT child: she is in the
 * building, she counts for ratios, she counts for evacuation, and she must be
 * charged and fed like any other child who came in. A consumer that pattern-matches
 * on "there was an absence plan" and treats her as away would leave a real child
 * out of a real ratio.
 *
 * The mirror trap is `unknown`. It is not "no expectation" and must never be
 * collapsed into `normal`: it means a lineage could not be resolved, and a
 * consumer that guesses is asserting something the platform explicitly could not.
 */
export type ServiceDayAssertions = {
    /** Is the child physically present, for ratio, evacuation and occupancy? */
    physicallyPresent: boolean;
    /** Was the child expected by the plan, before observation? */
    expectedByPlan: boolean;
    /** Is the reading a determinate answer, or an admission we could not tell? */
    determinate: boolean;
    /** Should a human look at this child today? */
    warrantsOperatorAttention: boolean;
};

const ASSERTIONS: Record<ServiceDayState, ServiceDayAssertions> = {
    here_now: { physicallyPresent: true, expectedByPlan: true, determinate: true, warrantsOperatorAttention: false },
    // Here, and nobody expected her. PRESENT for every physical purpose.
    attended_despite_plan: {
        physicallyPresent: true,
        expectedByPlan: false,
        determinate: true,
        warrantsOperatorAttention: true,
    },
    checked_out: { physicallyPresent: false, expectedByPlan: true, determinate: true, warrantsOperatorAttention: false },
    known_away: { physicallyPresent: false, expectedByPlan: false, determinate: true, warrantsOperatorAttention: false },
    closed: { physicallyPresent: false, expectedByPlan: false, determinate: true, warrantsOperatorAttention: false },
    not_arrived: { physicallyPresent: false, expectedByPlan: true, determinate: true, warrantsOperatorAttention: true },
    // An integrity failure, surfaced rather than smoothed over.
    unknown: { physicallyPresent: false, expectedByPlan: false, determinate: false, warrantsOperatorAttention: true },
};

export function serviceDayAssertions(state: ServiceDayState): ServiceDayAssertions {
    return ASSERTIONS[state];
}

/**
 * Does this child count towards physical occupancy and staffing ratios?
 *
 * The one question occupancy work must ask, so it cannot answer it by inspecting
 * state names and getting `attended_despite_plan` wrong.
 */
export function countsTowardsOccupancy(state: ServiceDayState): boolean {
    return ASSERTIONS[state].physicallyPresent;
}

/**
 * ── 3. THE FINANCIAL BOUNDARY ──
 *
 * A planned absence is an OPERATIONAL statement. Whether an absent day is
 * chargeable is a policy question owned by billing — some contracts charge for
 * notified absence, some do not, some depend on notice period, and none of that
 * is knowable from this reading.
 *
 * So this projection creates no charge, voids no charge, issues no credit, moves
 * no balance and posts no journal entry, and a consumer must not infer any of
 * those from a state. What it offers billing is an INPUT, honestly labelled: what
 * was expected, what was observed, and whether we could tell.
 *
 * `unknown` is the case that matters most here. Billing must not treat "we could
 * not determine this child's plan" as "the child attended normally" — it is the
 * one state where the right behaviour is to stop and ask, not to bill.
 */
export type ServiceDayBillingInput = {
    state: ServiceDayState;
    /** Present for the purposes of "did this child use the place". */
    attended: boolean;
    /** A plan said this child was not expected. Says NOTHING about chargeability. */
    plannedAbsence: boolean;
    /** The operating grain was not running. */
    closure: boolean;
    /** True when billing must not decide automatically. */
    requiresDetermination: boolean;
};

export function serviceDayBillingInput(state: ServiceDayState): ServiceDayBillingInput {
    const a = ASSERTIONS[state];
    return {
        state,
        attended: a.physicallyPresent,
        plannedAbsence: state === "known_away",
        closure: state === "closed",
        requiresDetermination: !a.determinate,
    };
}

/**
 * ── 4. WHAT A PARENT-FACING CHANNEL MAY SAY ──
 *
 * A parent channel may confirm what the centre expects. It may not report a state
 * the platform could not determine as though it were settled, and it must not
 * turn an operational reading into a commitment: "not expected today" is a
 * statement about the roster, never a promise about fees or a waiver of notice.
 */
export function isSafeToTellAParent(state: ServiceDayState): boolean {
    return ASSERTIONS[state].determinate;
}
