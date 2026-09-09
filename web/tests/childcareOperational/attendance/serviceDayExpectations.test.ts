/**
 * The service-day projection: schedule + effective expectations + observed facts.
 *
 * The case the whole architecture turns on is `attended_despite_plan` — a child
 * on authored vacation who walks in anyway. Getting that wrong in either
 * direction is a real operational failure: report only the plan and a present
 * child is invisible to ratios and evacuation; erase the plan and the operator
 * loses the one signal that something unexpected happened.
 */

import { describe, expect, it } from "vitest";
import {
    applyObservedPresence,
    interpretServiceDay,
    raisesMissingArrivalAttention,
    type ChildServiceDayExpectation,
} from "@/lib/childcareOperational/attendance/serviceDayExpectations";
import type { EffectiveExpectationForSubject } from "@/lib/operationalExpectations/query/effectiveExpectationsForWindow";

const SITE = "site-1";
const GROUP = "toddler-1";
const EMMA = "emma";
const FINN = "finn";

function prohibition(
    subjectKind: string,
    subjectId: string,
    reasonKey?: string,
): EffectiveExpectationForSubject {
    return {
        subjectKind,
        subjectId,
        expectationId: `exp-${subjectKind}-${subjectId}`,
        lineageRootId: `root-${subjectId}`,
        modality: "prohibited",
        condition: reasonKey ? { reason_key: reasonKey } : {},
        effectiveFrom: "2026-09-18",
        effectiveTo: "2026-09-18",
        standing: "proposed",
    };
}

const base = {
    siteLocationId: SITE,
    scheduledChildIds: [EMMA, FINN],
    groupByChildId: new Map([
        [EMMA, GROUP],
        [FINN, GROUP],
    ]),
};

const byChild = (rows: ChildServiceDayExpectation[]) => new Map(rows.map((r) => [r.childId, r]));

describe("no expectations — the ordinary day is untouched", () => {
    it("leaves every scheduled child normal", () => {
        const rows = interpretServiceDay({ ...base, effective: [] });
        expect(rows.map((r) => r.interpretation)).toEqual(["normal", "normal"]);
    });

    it("cannot add a child nobody scheduled", () => {
        // An expectation about a child who is not on today's schedule must not
        // conjure them onto the roster — that would turn a vacation note into an
        // enrolment.
        const rows = interpretServiceDay({
            ...base,
            scheduledChildIds: [FINN],
            effective: [prohibition("child", EMMA, "vacation")],
        });
        expect(rows.map((r) => r.childId)).toEqual([FINN]);
    });
});

describe("planned absence and same-day sick — known away", () => {
    it("reads a child prohibition as known away, carrying the reason", () => {
        const rows = byChild(
            interpretServiceDay({ ...base, effective: [prohibition("child", EMMA, "vacation")] }),
        );
        expect(rows.get(EMMA)).toMatchObject({ interpretation: "known_away", reasonKey: "vacation" });
        expect(rows.get(FINN)?.interpretation).toBe("normal");
    });

    it("carries a sick reason the same way — one mechanism, different meaning", () => {
        const rows = byChild(
            interpretServiceDay({ ...base, effective: [prohibition("child", EMMA, "illness")] }),
        );
        expect(rows.get(EMMA)?.reasonKey).toBe("illness");
    });

    it("stops a known-away child raising unexplained missing-arrival attention", () => {
        const [emma] = interpretServiceDay({ ...base, scheduledChildIds: [EMMA], effective: [prohibition("child", EMMA, "illness")] });
        expect(raisesMissingArrivalAttention(applyObservedPresence(emma, "no_record"))).toBe(false);
    });

    it("still raises attention for a child with no expectation and no arrival", () => {
        const [finn] = interpretServiceDay({ ...base, scheduledChildIds: [FINN], effective: [] });
        expect(applyObservedPresence(finn, "no_record")).toBe("not_arrived");
        expect(raisesMissingArrivalAttention("not_arrived")).toBe(true);
    });
});

describe("closure — authored once, applied to whoever was scheduled", () => {
    it("a single site prohibition closes the day for every scheduled child", () => {
        const rows = interpretServiceDay({
            ...base,
            effective: [prohibition("site", SITE, "holiday_closure")],
        });
        expect(rows.map((r) => r.interpretation)).toEqual(["closed", "closed"]);
        // One authored expectation, not one per child.
        expect(new Set(rows.map((r) => r.expectationId)).size).toBe(1);
    });

    it("closes an operational group while the site stays open", () => {
        const rows = byChild(
            interpretServiceDay({
                ...base,
                groupByChildId: new Map([
                    [EMMA, GROUP],
                    [FINN, "toddler-2"],
                ]),
                effective: [prohibition("operational_group", GROUP)],
            }),
        );
        expect(rows.get(EMMA)).toMatchObject({ interpretation: "closed", closedSubjectKind: "operational_group" });
        expect(rows.get(FINN)?.interpretation).toBe("normal");
    });

    it("site closure outranks an individual plan — nobody is expected either way", () => {
        const rows = byChild(
            interpretServiceDay({
                ...base,
                effective: [prohibition("site", SITE, "weather_closure"), prohibition("child", EMMA, "vacation")],
            }),
        );
        expect(rows.get(EMMA)?.interpretation).toBe("closed");
    });

    it("closure suppresses missing-arrival attention for everyone", () => {
        const rows = interpretServiceDay({ ...base, effective: [prohibition("site", SITE)] });
        for (const r of rows) {
            expect(raisesMissingArrivalAttention(applyObservedPresence(r, "no_record"))).toBe(false);
        }
    });
});

describe("an unresolved lineage is not a clear day", () => {
    it("reports unknown rather than normal when the ledger could not tell us", () => {
        const rows = byChild(
            interpretServiceDay({
                ...base,
                effective: [],
                unresolved: [
                    { subjectKind: "child", subjectId: EMMA, lineageRootId: "root-emma", reason: "unsupported_transition:cancellation" },
                ],
            }),
        );
        expect(rows.get(EMMA)?.interpretation).toBe("unknown");
        expect(rows.get(FINN)?.interpretation).toBe("normal");
    });

    it("does not file an unknown child as a missing arrival", () => {
        const [emma] = interpretServiceDay({
            ...base,
            scheduledChildIds: [EMMA],
            effective: [],
            unresolved: [{ subjectKind: "child", subjectId: EMMA, lineageRootId: "r", reason: "x" }],
        });
        const state = applyObservedPresence(emma, "no_record");
        expect(state).toBe("unknown");
        // A data problem must not masquerade as an operational one.
        expect(raisesMissingArrivalAttention(state)).toBe(false);
    });
});

describe("OBSERVED FACTS WIN — the case the architecture turns on", () => {
    const onVacation = () =>
        interpretServiceDay({ ...base, scheduledChildIds: [EMMA], effective: [prohibition("child", EMMA, "vacation")] })[0];

    it("a child who attends despite a vacation plan is present, and visibly unplanned", () => {
        expect(applyObservedPresence(onVacation(), "present")).toBe("attended_despite_plan");
    });

    it("the vacation expectation is not erased by her arriving", () => {
        const emma = onVacation();
        applyObservedPresence(emma, "present");
        // The interpretation object is untouched — reality did not make the plan
        // retrospectively false, and the lineage still explains what was expected.
        expect(emma.interpretation).toBe("known_away");
        expect(emma.expectationId).toBe(`exp-child-${EMMA}`);
    });

    it("attending during a closure reads the same way", () => {
        const [emma] = interpretServiceDay({ ...base, scheduledChildIds: [EMMA], effective: [prohibition("site", SITE)] });
        expect(applyObservedPresence(emma, "present")).toBe("attended_despite_plan");
    });

    it("a normally expected child who arrives is simply here now", () => {
        const [finn] = interpretServiceDay({ ...base, scheduledChildIds: [FINN], effective: [] });
        expect(applyObservedPresence(finn, "present")).toBe("here_now");
    });

    it("checkout is observed truth regardless of what was expected", () => {
        expect(applyObservedPresence(onVacation(), "checked_out")).toBe("checked_out");
    });

    it("neither known-away nor attended-despite raises a missing arrival", () => {
        expect(raisesMissingArrivalAttention("attended_despite_plan")).toBe(false);
        expect(raisesMissingArrivalAttention("known_away")).toBe(false);
        expect(raisesMissingArrivalAttention("here_now")).toBe(false);
        expect(raisesMissingArrivalAttention("closed")).toBe(false);
    });
});
