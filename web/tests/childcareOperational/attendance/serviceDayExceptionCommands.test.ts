/**
 * The operator commands, and the round trip that proves they mean anything.
 *
 * Building a well-formed tuple is the easy half. The half that actually failed —
 * silently, with every unit test green — is whether a row authored by these
 * commands is one the query seam finds and the projection understands. So the
 * last block authors a command, stores it exactly the way the intake stores it,
 * and reads it back through the real seam and the real projection.
 */

import { describe, expect, it } from "vitest";
import {
    closeOperatingGrain,
    correctChildAway,
    markChildAway,
    reopenOperatingGrain,
    reviseChildAway,
    withdrawChildAway,
} from "@/lib/childcareOperational/attendance/serviceDayExceptionCommands";
import {
    ATTENDANCE_EXPECTATION_PURPOSE,
    SERVICE_DAY_PREDICATES,
    interpretServiceDay,
    applyObservedPresence,
    serviceDayAsOf,
} from "@/lib/childcareOperational/attendance/serviceDayExpectations";
import { validateAuthoringTuple } from "@/lib/operationalExpectations/intake/validateAuthoringTuple";
import { VERB_TRANSITION_MAP } from "@/lib/operationalExpectations/expectationLedgerContract";
import {
    effectiveExpectationsForWindow,
    type ExpectationQueryRow,
} from "@/lib/operationalExpectations/query/effectiveExpectationsForWindow";
import type { AuthoringInput } from "@/lib/operationalExpectations/intake/authoringTypes";

const ORG = "org-1";
const SITE = "site-1";
const ROOM = "toddler-a";
const EMMA = "emma";
const DAY = "2026-09-18";

const common = { idempotencyKey: "k1", actorUserId: "user-9", reasonKey: "illness" };

describe("every command produces a tuple the intake accepts", () => {
    const cases: [string, AuthoringInput][] = [
        ["mark away", markChildAway({ ...common, childId: EMMA, range: { fromDate: DAY } })],
        ["revise", reviseChildAway({ ...common, childId: EMMA, range: { fromDate: DAY }, predecessorId: "p1" })],
        ["withdraw", withdrawChildAway({ ...common, childId: EMMA, range: { fromDate: DAY }, predecessorId: "p1" })],
        ["correct", correctChildAway({ ...common, childId: EMMA, range: { fromDate: DAY }, predecessorId: "p1" })],
        ["close site", closeOperatingGrain({ ...common, grainKind: "site", grainId: SITE, range: { fromDate: DAY } })],
        [
            "reopen room",
            reopenOperatingGrain({
                ...common,
                grainKind: "operational_group",
                grainId: ROOM,
                range: { fromDate: DAY },
                predecessorId: "p1",
            }),
        ],
    ];

    for (const [name, input] of cases) {
        it(`${name} passes the frozen grammar`, () => {
            expect(validateAuthoringTuple(input)).toEqual({ ok: true });
        });
    }

    it("authors under the attendance purpose, never a borrowed vocabulary", () => {
        for (const [, input] of cases) {
            expect(input.condition.typeKey).toBe(ATTENDANCE_EXPECTATION_PURPOSE);
        }
    });

    it("names the actor as the authority rather than accepting one", () => {
        const input = markChildAway({ ...common, childId: EMMA, range: { fromDate: DAY } });
        expect(input.authority).toEqual({ authorityKey: "user:user-9", authorClass: "human" });
    });
});

describe("the window covers the whole of the last day", () => {
    it("makes a single day a full day", () => {
        const input = markChildAway({ ...common, childId: EMMA, range: { fromDate: DAY } });
        expect(input.temporalFrame).toMatchObject({
            kind: "window",
            validFrom: "2026-09-18T00:00:00.000Z",
            validTo: "2026-09-19T00:00:00.000Z",
        });
    });

    it("runs a Mon–Fri holiday to Saturday morning, not Friday morning", () => {
        // Ending at the last day's START would silently drop the final day of
        // every holiday — the child would be expected in on the Friday.
        const input = markChildAway({
            ...common,
            childId: EMMA,
            range: { fromDate: "2026-09-21", toDate: "2026-09-25" },
        });
        expect(input.temporalFrame.validTo).toBe("2026-09-26T00:00:00.000Z");
    });

    it("refuses a range that ends before it starts", () => {
        expect(() =>
            markChildAway({ ...common, childId: EMMA, range: { fromDate: "2026-09-25", toDate: "2026-09-21" } }),
        ).toThrow();
    });
});

describe("changing a future plan is a revision — never a cancellation", () => {
    it("withdraws a holiday by revising the intent, not cancelling it", () => {
        const input = withdrawChildAway({
            ...common,
            reasonKey: "plans_changed",
            childId: EMMA,
            range: { fromDate: DAY },
            predecessorId: "p1",
        });
        expect(input.verb).toBe("revise");
        expect(VERB_TRANSITION_MAP[input.verb]).toBe("revision");
        // A `cancellation` is the fail-closed transition: the child's day would
        // become undeterminable rather than ordinary.
        expect(VERB_TRANSITION_MAP[input.verb]).not.toBe("cancellation");
        expect(input.condition.predicateShape).toBe(SERVICE_DAY_PREDICATES.childExpectedPresent);
    });

    it("keeps correction a genuinely different act", () => {
        const input = correctChildAway({ ...common, childId: EMMA, range: { fromDate: DAY }, predecessorId: "p1" });
        expect(VERB_TRANSITION_MAP[input.verb]).toBe("correction");
    });

    it("carries the predecessor so the change stays on one history", () => {
        const input = reviseChildAway({ ...common, childId: EMMA, range: { fromDate: DAY }, predecessorId: "p1" });
        expect(input.predecessorId).toBe("p1");
    });

    it("never sends a create with a predecessor", () => {
        expect(markChildAway({ ...common, childId: EMMA, range: { fromDate: DAY } }).predecessorId).toBeNull();
    });
});

describe("closure is one act at the grain that is not operating", () => {
    it("closes a site with a single expectation about the site", () => {
        const input = closeOperatingGrain({
            ...common,
            reasonKey: "holiday_closure",
            grainKind: "site",
            grainId: SITE,
            range: { fromDate: DAY },
        });
        expect(input.subjects).toEqual([{ kind: "site", ref: SITE }]);
        expect(input.modality).toBe("prohibited");
        expect(input.condition.params).toMatchObject({ reason_key: "holiday_closure" });
    });

    it("closes a room at the room grain", () => {
        const input = closeOperatingGrain({
            ...common,
            grainKind: "operational_group",
            grainId: ROOM,
            range: { fromDate: DAY },
        });
        expect(input.subjects).toEqual([{ kind: "operational_group", ref: ROOM }]);
    });

    it("uses the deontic modality ONLY for closure", () => {
        // A child is never prohibited from attending; see Scenario F.
        for (const input of [
            markChildAway({ ...common, childId: EMMA, range: { fromDate: DAY } }),
            withdrawChildAway({ ...common, childId: EMMA, range: { fromDate: DAY }, predecessorId: "p1" }),
        ]) {
            expect(input.modality).toBe("intended");
        }
    });

    it("reopens without re-imposing an obligation", () => {
        const input = reopenOperatingGrain({
            ...common,
            grainKind: "site",
            grainId: SITE,
            range: { fromDate: DAY },
            predecessorId: "p1",
        });
        expect(input.modality).toBe("intended");
        expect(input.condition.predicateShape).toBe(SERVICE_DAY_PREDICATES.grainOpen);
    });
});

describe("the operator's note travels with the intent", () => {
    it("carries a note as a parameter, and omits it when blank", () => {
        const withNote = markChildAway({ ...common, childId: EMMA, range: { fromDate: DAY }, note: "  chickenpox " });
        expect(withNote.condition.params).toEqual({ reason_key: "illness", note: "chickenpox" });
        const without = markChildAway({ ...common, childId: EMMA, range: { fromDate: DAY }, note: "   " });
        expect(without.condition.params).toEqual({ reason_key: "illness" });
    });
});

/**
 * ── THE ROUND TRIP ──
 *
 * Store the authored tuple exactly the way the intake stores it — `subject_ref`
 * is the subject ARRAY, `condition` is the whole facet — and read it back through
 * the real seam and the real projection. This is the test that would have caught
 * a seam reading `subject_ref.id`: every other test passed while the mounted
 * product saw nothing at all.
 */
function storedRow(input: AuthoringInput, over: Partial<ExpectationQueryRow> = {}): ExpectationQueryRow {
    const id = String(over.id ?? "row-1");
    return {
        id,
        org_id: ORG,
        lineage_root_id: id,
        supersedes_expectation_id: null,
        verb: input.verb,
        transition_type: VERB_TRANSITION_MAP[input.verb],
        modality: input.modality,
        author_class: input.authority.authorClass,
        authority_key: input.authority.authorityKey,
        standing: input.modality === "predicted" ? "model" : "proposed",
        subject_kind: input.subjects[0].kind,
        subject_ref: input.subjects,
        condition: input.condition as unknown as Record<string, unknown>,
        valid_from: input.temporalFrame.validFrom,
        valid_to: input.temporalFrame.validTo ?? null,
        authored_at: "2026-09-15T09:00:00.000Z",
        ...over,
    } as ExpectationQueryRow;
}

async function project(rows: ExpectationQueryRow[], scheduled = [EMMA]) {
    const result = await effectiveExpectationsForWindow(
        {
            orgId: ORG,
            subjects: [
                { kind: "site", id: SITE },
                { kind: "operational_group", id: ROOM },
                ...scheduled.map((id) => ({ kind: "child", id })),
            ],
            asOf: serviceDayAsOf(DAY),
        },
        { loadRowsForSubjects: async () => rows },
    );
    return interpretServiceDay({
        siteLocationId: SITE,
        scheduledChildIds: scheduled,
        groupByChildId: new Map(scheduled.map((id) => [id, ROOM])),
        effective: result.effective,
        unresolved: result.unresolved,
    });
}

describe("ROUND TRIP — an authored command is a reading the roster acts on", () => {
    it("a same-day sick call reads as known away, with the reason", async () => {
        const [emma] = await project([
            storedRow(markChildAway({ ...common, childId: EMMA, range: { fromDate: DAY } })),
        ]);
        expect(emma).toMatchObject({ interpretation: "known_away", reasonKey: "illness" });
        expect(applyObservedPresence(emma, "no_record")).toBe("known_away");
    });

    it("a holiday spanning the day covers it", async () => {
        const [emma] = await project([
            storedRow(
                markChildAway({
                    ...common,
                    reasonKey: "vacation",
                    childId: EMMA,
                    range: { fromDate: "2026-09-14", toDate: "2026-09-25" },
                }),
            ),
        ]);
        expect(emma.interpretation).toBe("known_away");
    });

    it("a site closure closes the day for everyone scheduled", async () => {
        const rows = await project(
            [
                storedRow(
                    closeOperatingGrain({
                        ...common,
                        reasonKey: "holiday_closure",
                        grainKind: "site",
                        grainId: SITE,
                        range: { fromDate: DAY },
                    }),
                ),
            ],
            [EMMA, "finn"],
        );
        expect(rows.map((r) => r.interpretation)).toEqual(["closed", "closed"]);
        expect(rows[0].reasonKey).toBe("holiday_closure");
    });

    it("a room closure closes only that room's children", async () => {
        const rows = await project(
            [
                storedRow(
                    closeOperatingGrain({
                        ...common,
                        grainKind: "operational_group",
                        grainId: ROOM,
                        range: { fromDate: DAY },
                    }),
                ),
            ],
            [EMMA],
        );
        expect(rows[0]).toMatchObject({ interpretation: "closed", closedSubjectKind: "operational_group" });
    });

    it("withdrawing the holiday puts the child back on the ordinary roster", async () => {
        const away = markChildAway({ ...common, reasonKey: "vacation", childId: EMMA, range: { fromDate: DAY } });
        const back = withdrawChildAway({
            ...common,
            idempotencyKey: "k2",
            reasonKey: "plans_changed",
            childId: EMMA,
            range: { fromDate: DAY },
            predecessorId: "v1",
        });
        const rows = [
            storedRow(away, { id: "v1", lineage_root_id: "v1" }),
            storedRow(back, {
                id: "v2",
                lineage_root_id: "v1",
                supersedes_expectation_id: "v1",
                authored_at: "2026-09-17T09:00:00.000Z",
            }),
        ];
        const [emma] = await project(rows);
        expect(emma.interpretation).toBe("normal");
        // And she is missed if she does not turn up, which is the whole point of
        // putting her back.
        expect(applyObservedPresence(emma, "no_record")).toBe("not_arrived");
    });

    it("a child who attends her own holiday is present AND visibly unplanned", async () => {
        const [emma] = await project([
            storedRow(markChildAway({ ...common, reasonKey: "vacation", childId: EMMA, range: { fromDate: DAY } })),
        ]);
        expect(applyObservedPresence(emma, "present")).toBe("attended_despite_plan");
    });

    it("an expectation for another day does not touch this one", async () => {
        const [emma] = await project([
            storedRow(markChildAway({ ...common, childId: EMMA, range: { fromDate: "2026-09-19" } })),
        ]);
        expect(emma.interpretation).toBe("normal");
    });
});
