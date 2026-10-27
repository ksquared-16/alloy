/**
 * The shared query seam completes lineages.
 *
 * A revision whose own window does not touch the coordinate is still the act that
 * ended its predecessor there. Before the fix the seam returned only rows touching
 * the coordinate, so "closed Mon–Fri, revised to Mon–Wed" still read CLOSED on
 * Thursday — for the roster, the kiosk, and anything else reading the ledger.
 */
import { describe, expect, it } from "vitest";
import { effectiveExpectationsForWindow } from "@/lib/operationalExpectations/query/effectiveExpectationsForWindow";
import { createSupabaseExpectationQueryGateway } from "@/lib/operationalExpectations/query/supabaseExpectationQueryGateway";
import {
    ATTENDANCE_SUBJECT_KINDS,
    interpretServiceDay,
    serviceDayAsOf,
} from "@/lib/childcareOperational/attendance/serviceDayExpectations";
import { closeOperatingGrain, markChildAway, reviseChildAway } from "@/lib/childcareOperational/attendance/serviceDayExceptionCommands";
import { ACTOR, ORG, SITE_A, rowFrom } from "./operatingCalendarFixtures";
import { fakeSupabase } from "./fakeSupabase";

const CHILD = "00000000-0000-4000-8000-0000000000c9";

async function readChild(rows: ReturnType<typeof rowFrom>[], date: string) {
    const supabase = fakeSupabase({ operational_expectations: rows as never, operational_expectation_ratifications: [] });
    const result = await effectiveExpectationsForWindow(
        { orgId: ORG, subjects: [{ kind: ATTENDANCE_SUBJECT_KINDS.child, id: CHILD }], asOf: serviceDayAsOf(date) },
        createSupabaseExpectationQueryGateway(supabase),
    );
    return interpretServiceDay({ siteLocationId: SITE_A, scheduledChildIds: [CHILD], effective: result.effective, unresolved: result.unresolved })[0]!;
}

describe("query seam — lineage completion", () => {
    it("a shortened absence no longer covers the dropped days", async () => {
        const away = rowFrom(
            markChildAway({ idempotencyKey: "a1", actorUserId: ACTOR, reasonKey: "vacation", childId: CHILD, range: { fromDate: "2027-01-04", toDate: "2027-01-08" } }),
        );
        const shorter = rowFrom(
            reviseChildAway({
                idempotencyKey: "a2",
                actorUserId: ACTOR,
                reasonKey: "vacation",
                childId: CHILD,
                range: { fromDate: "2027-01-04", toDate: "2027-01-06" },
                predecessorId: away.id,
            }),
            { root: away.id },
        );
        expect((await readChild([away, shorter], "2027-01-05")).interpretation).toBe("known_away");
        // Thursday: only the original row touches the coordinate; the revision ended it.
        expect((await readChild([away, shorter], "2027-01-07")).interpretation).toBe("normal");
    });

    it("an unrevised absence still reads as before", async () => {
        const away = rowFrom(
            markChildAway({ idempotencyKey: "b1", actorUserId: ACTOR, reasonKey: "sick", childId: CHILD, range: { fromDate: "2027-01-04" } }),
        );
        expect((await readChild([away], "2027-01-04")).interpretation).toBe("known_away");
        expect((await readChild([away], "2027-01-05")).interpretation).toBe("normal");
    });

    it("lineage completion stays inside the org", async () => {
        const closure = rowFrom(
            closeOperatingGrain({ idempotencyKey: "c1", actorUserId: ACTOR, reasonKey: "other", grainKind: "site", grainId: SITE_A, range: { fromDate: "2027-01-04" } }),
        );
        // A forged foreign row claiming the same lineage root is never loaded.
        const foreign = { ...rowFrom(closeOperatingGrain({ idempotencyKey: "c2", actorUserId: ACTOR, reasonKey: "other", grainKind: "site", grainId: SITE_A, range: { fromDate: "2027-01-04" } })), org_id: "someone-else", lineage_root_id: closure.id };
        const supabase = fakeSupabase({ operational_expectations: [closure, foreign] as never, operational_expectation_ratifications: [] });
        const result = await effectiveExpectationsForWindow(
            { orgId: ORG, subjects: [{ kind: ATTENDANCE_SUBJECT_KINDS.site, id: SITE_A }], asOf: serviceDayAsOf("2027-01-04") },
            createSupabaseExpectationQueryGateway(supabase),
        );
        expect(result.effective.map((e) => e.expectationId)).toEqual([closure.id]);
    });
});
