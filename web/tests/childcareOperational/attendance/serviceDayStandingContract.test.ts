/**
 * THE STANDING CONTRACT, LOCKED.
 *
 * These tests exist to fail loudly if someone later "tightens" Attendance by
 * requiring `binding` standing. That change is one line, looks like prudence, and
 * would make every operator-authored absence and closure silently disappear from
 * the roster — a holiday would come back as a hundred unexplained missing
 * arrivals, and a child whose parent rang at seven would be chased.
 *
 * The ruling being locked: Attendance consumes EFFECTIVE expectation semantics
 * independent of ledger standing. Standing stays ledger-owned metadata about
 * binding force across all consumers; this projection answers the narrower
 * question of how one child's day reads.
 *
 * `proposed` is what every operator command produces TODAY, because Attendance
 * authors under an individual rather than a governed authority. That is a fact
 * about governance configuration, not a rule — the day such a role exists the same
 * command path produces stronger standing through the ledger's own machinery, and
 * every assertion below must still hold.
 */

import { describe, expect, it } from "vitest";
import {
    ATTENDANCE_EXPECTATION_PURPOSE,
    EXPECTATION_STANDINGS_CONSUMED,
    SERVICE_DAY_PREDICATES,
    applyObservedPresence,
    expectationStandingIsConsumable,
    interpretServiceDay,
    raisesMissingArrivalAttention,
    serviceDayExpectationRelevance,
} from "@/lib/childcareOperational/attendance/serviceDayExpectations";
import type { EffectiveExpectationForSubject } from "@/lib/operationalExpectations/query/effectiveExpectationsForWindow";

const SITE = "site-1";
const GROUP = "toddler-1";
const EMMA = "emma";
const FINN = "finn";

/** Every standing the ledger's own vocabulary can express. */
const LEDGER_STANDINGS = ["proposed", "binding", "model"] as const;

function expectation(over: Partial<EffectiveExpectationForSubject> & { standing: string }): EffectiveExpectationForSubject {
    return {
        subjectKind: "child",
        subjectId: EMMA,
        expectationId: "exp-1",
        lineageRootId: "root-1",
        modality: "intended",
        condition: {
            typeKey: ATTENDANCE_EXPECTATION_PURPOSE,
            predicateShape: SERVICE_DAY_PREDICATES.childAway,
            params: { reason_key: "illness" },
        },
        effectiveFrom: "2026-09-18T00:00:00.000Z",
        effectiveTo: "2026-09-19T00:00:00.000Z",
        ...over,
    };
}

function closure(standing: string, subjectKind = "site", subjectId = SITE): EffectiveExpectationForSubject {
    return expectation({
        standing,
        subjectKind,
        subjectId,
        modality: "prohibited",
        condition: {
            typeKey: ATTENDANCE_EXPECTATION_PURPOSE,
            predicateShape: SERVICE_DAY_PREDICATES.grainClosed,
            params: { reason_key: "holiday_closure" },
        },
    });
}

const base = {
    siteLocationId: SITE,
    scheduledChildIds: [EMMA, FINN],
    groupByChildId: new Map([
        [EMMA, GROUP],
        [FINN, GROUP],
    ]),
};

describe("standing never excludes an otherwise relevant expectation", () => {
    it("consumes an absence at every standing the ledger can express", () => {
        for (const standing of LEDGER_STANDINGS) {
            const [emma] = interpretServiceDay({
                ...base,
                scheduledChildIds: [EMMA],
                effective: [expectation({ standing })],
            });
            expect(emma.interpretation, `standing "${standing}" was ignored`).toBe("known_away");
        }
    });

    it("consumes a closure at every standing the ledger can express", () => {
        for (const standing of LEDGER_STANDINGS) {
            const rows = interpretServiceDay({ ...base, effective: [closure(standing)] });
            expect(
                rows.every((r) => r.interpretation === "closed"),
                `a closure at "${standing}" did not close the day`,
            ).toBe(true);
        }
    });

    it("reports relevance identically whatever the standing", () => {
        const verdicts = LEDGER_STANDINGS.map((standing) => serviceDayExpectationRelevance(expectation({ standing })));
        expect(verdicts).toEqual(verdicts.map(() => ({ relevant: true, kind: "child_away" })));
    });

    it("publishes the consumed set, so narrowing it is a visible act", () => {
        expect([...EXPECTATION_STANDINGS_CONSUMED].sort()).toEqual([...LEDGER_STANDINGS].sort());
        for (const standing of LEDGER_STANDINGS) {
            expect(expectationStandingIsConsumable(standing)).toBe(true);
        }
    });
});

describe("a proposed closure is operationally effective — the ruling, stated as a test", () => {
    const PROPOSED = "proposed";

    it("closes the service day for every scheduled child", () => {
        const rows = interpretServiceDay({ ...base, effective: [closure(PROPOSED)] });
        expect(rows.map((r) => r.interpretation)).toEqual(["closed", "closed"]);
        // One authored statement, not one per child.
        expect(new Set(rows.map((r) => r.expectationId)).size).toBe(1);
    });

    it("stops every scheduled child reading as an unexplained missing arrival", () => {
        // This is the operational consequence the ruling turns on: a public
        // holiday must not arrive as a screen full of children to chase.
        for (const row of interpretServiceDay({ ...base, effective: [closure(PROPOSED)] })) {
            expect(raisesMissingArrivalAttention(applyObservedPresence(row, "no_record"))).toBe(false);
        }
    });

    it("closes a room at the room grain while the site stays open", () => {
        const rows = interpretServiceDay({
            ...base,
            groupByChildId: new Map([
                [EMMA, GROUP],
                [FINN, "toddler-2"],
            ]),
            effective: [closure(PROPOSED, "operational_group", GROUP)],
        });
        expect(rows.find((r) => r.childId === EMMA)?.interpretation).toBe("closed");
        expect(rows.find((r) => r.childId === FINN)?.interpretation).toBe("normal");
    });

    it("does not restate the expectation's standing as anything else", () => {
        // Attendance interprets; it never rewrites what the ledger recorded. The
        // projection carries no standing field at all, which is the strongest
        // available guarantee that it cannot promote one.
        const [emma] = interpretServiceDay({
            ...base,
            scheduledChildIds: [EMMA],
            effective: [expectation({ standing: PROPOSED })],
        });
        expect(Object.keys(emma)).not.toContain("standing");
    });
});

describe("what DOES make an expectation irrelevant is semantic, never governance", () => {
    it("refuses another domain's vocabulary", () => {
        const foreign = closure("binding");
        foreign.condition = { ...foreign.condition, typeKey: "facilities.embargo" };
        expect(serviceDayExpectationRelevance(foreign)).toEqual({ relevant: false, reason: "foreign_purpose" });
    });

    it("refuses a subject the projection has no meaning for", () => {
        // A prohibition on a CHILD is not a closure and not a plan; guessing
        // would invent meaning the author did not express.
        expect(serviceDayExpectationRelevance(closure("binding", "child", EMMA))).toEqual({
            relevant: false,
            reason: "unsupported_semantics",
        });
    });

    it("refuses a predicate that says the opposite", () => {
        const withdrawn = expectation({ standing: "binding" });
        withdrawn.condition = {
            ...withdrawn.condition,
            predicateShape: SERVICE_DAY_PREDICATES.childExpectedPresent,
        };
        expect(serviceDayExpectationRelevance(withdrawn)).toEqual({
            relevant: false,
            reason: "unsupported_semantics",
        });
    });

    it("refuses only a standing the ledger cannot express", () => {
        // Deliberately total: an invented standing is a data-integrity problem,
        // not a governance judgement, and must be considered explicitly rather
        // than defaulting into the consumed set.
        expect(serviceDayExpectationRelevance(expectation({ standing: "invented" }))).toEqual({
            relevant: false,
            reason: "unconsumable_standing",
        });
    });
});
