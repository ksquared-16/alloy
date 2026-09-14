/**
 * Thread 9, Phase B — the counts must consume Thread 3/4 meaning, not restate it.
 *
 * Every service-day state in these fixtures is produced by the CANONICAL
 * resolvers — `applyObservedPresence` decides the state and
 * `raisesMissingArrivalAttention` decides whether it is an unexplained missing
 * arrival — assembled exactly as `buildCombinedRoster` assembles them. Nothing
 * here hand-writes a state string.
 *
 * That is deliberate. A test that typed `state: "known_away"` itself would pass
 * even if the resolver and the workspace had drifted apart, which is the one
 * failure these metrics exist to avoid. Driving the real interpretation means a
 * change to what "known away" means breaks this file too.
 */

import { describe, expect, it } from "vitest";
import {
    applyObservedPresence,
    raisesMissingArrivalAttention,
    type ChildServiceDayExpectation,
    type ExpectedInterpretation,
} from "@/lib/childcareOperational/attendance/serviceDayExpectations";
import { computeServiceDayCounts } from "@/lib/metrics/resolvers/attendanceServiceDayMetrics";

const DATE = "2026-09-12";

function expectation(
    interpretation: ExpectedInterpretation,
    reasonKey: string | null = null,
): ChildServiceDayExpectation {
    return {
        childId: "c",
        interpretation,
        reasonKey,
        closedSubjectKind: interpretation === "closed" ? "site" : null,
        closedSubjectId: interpretation === "closed" ? "site-1" : null,
        expectationId: interpretation === "normal" ? null : "exp-1",
    };
}

/** A roster child, built the way buildCombinedRoster builds one. */
function child(
    id: string,
    interpretation: ExpectedInterpretation,
    observed: "present" | "checked_out" | "absent" | "no_record",
) {
    const exp = expectation(interpretation);
    const state = applyObservedPresence(exp, observed);
    return {
        customerMemberId: id,
        serviceDay: {
            state,
            expectationId: exp.expectationId,
            dayClosed: exp.interpretation === "closed",
            reasonKey: exp.reasonKey,
            raisesAttention: raisesMissingArrivalAttention(state),
        },
    };
}

function roster(...children: ReturnType<typeof child>[]) {
    return [{ cells: [{ children }] }];
}

describe("A — an ordinary service day", () => {
    it("counts each child once, in the state the canonical resolver assigned", () => {
        const counts = computeServiceDayCounts(
            roster(
                child("here-1", "normal", "present"),
                child("here-2", "normal", "present"),
                child("out-1", "normal", "checked_out"),
                child("missing-1", "normal", "no_record"),
            ),
            DATE,
        );
        expect(counts.expected).toBe(4);
        expect(counts.hereNow).toBe(2);
        expect(counts.checkedOut).toBe(1);
        expect(counts.notArrived).toBe(1);
        expect(counts.knownAway).toBe(0);
    });
});

describe("B — known away must not inflate unexplained not-arrived", () => {
    it("counts an authored absence as known away, never as missing", () => {
        const counts = computeServiceDayCounts(
            roster(
                child("away-1", "known_away", "no_record"),
                child("away-2", "known_away", "no_record"),
                child("missing-1", "normal", "no_record"),
            ),
            DATE,
        );
        expect(counts.knownAway).toBe(2);
        // The whole point: three children are absent from the building and only
        // ONE of them is a problem.
        expect(counts.notArrived).toBe(1);
    });

    it("keeps not-arrived at zero when every absence is explained", () => {
        const counts = computeServiceDayCounts(
            roster(child("away-1", "known_away", "no_record"), child("away-2", "known_away", "no_record")),
            DATE,
        );
        expect(counts.notArrived).toBe(0);
    });
});

describe("C — a closure must not read as mass missing attendance", () => {
    it("counts a closed cohort as closed, and raises no missing arrivals at all", () => {
        const counts = computeServiceDayCounts(
            roster(
                child("c1", "closed", "no_record"),
                child("c2", "closed", "no_record"),
                child("c3", "closed", "no_record"),
                child("c4", "closed", "no_record"),
            ),
            DATE,
        );
        expect(counts.expected).toBe(4);
        // A snow day is not four children going unaccounted for.
        expect(counts.notArrived).toBe(0);
        expect(counts.hereNow).toBe(0);
    });
});

describe("D — attended despite plan is present AND still distinguishable", () => {
    it("counts a child who turned up on an authored absence as physically here", () => {
        const counts = computeServiceDayCounts(roster(child("emma", "known_away", "present")), DATE);
        // She is in the building, so occupancy-shaped questions must see her.
        expect(counts.hereNow).toBe(1);
        // And the plan is not retrospectively rewritten: she is not "known away".
        expect(counts.knownAway).toBe(0);
        // The distinction survives as its own count.
        expect(counts.attendedDespitePlan).toBe(1);
        expect(counts.notArrived).toBe(0);
    });

    it("counts a child who turns up on a closed day the same way", () => {
        const counts = computeServiceDayCounts(roster(child("theo", "closed", "present")), DATE);
        expect(counts.hereNow).toBe(1);
        expect(counts.attendedDespitePlan).toBe(1);
    });
});

describe("integrity state is visible, and is not a missing child", () => {
    it("counts an unresolved service day separately from not-arrived", () => {
        const counts = computeServiceDayCounts(roster(child("u1", "unknown", "no_record")), DATE);
        expect(counts.unknownState).toBe(1);
        // A data problem must not masquerade as an operational one.
        expect(counts.notArrived).toBe(0);
    });
});

describe("counting hygiene", () => {
    it("never counts the same child twice across cells", () => {
        const c = child("visitor", "normal", "present");
        const counts = computeServiceDayCounts([{ cells: [{ children: [c] }, { children: [c] }] }], DATE);
        expect(counts.expected).toBe(1);
        expect(counts.hereNow).toBe(1);
    });

    it("reports a child with no service-day reading rather than silently dropping them", () => {
        const counts = computeServiceDayCounts(
            [{ cells: [{ children: [{ customerMemberId: "x" }] }] }],
            DATE,
        );
        expect(counts.expected).toBe(1);
        expect(counts.withoutServiceDay).toBe(1);
    });

    it("sums across sites for an org-wide read", () => {
        const counts = computeServiceDayCounts(
            [
                { cells: [{ children: [child("a", "normal", "present")] }] },
                { cells: [{ children: [child("b", "normal", "present")] }] },
            ],
            DATE,
        );
        expect(counts.siteCount).toBe(2);
        expect(counts.hereNow).toBe(2);
    });
});
