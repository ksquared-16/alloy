/**
 * The batch availability read.
 *
 * Two claims worth testing without a database, because both are about the SHAPE
 * of the read rather than about what the rows mean: that a site's answer costs
 * two queries rather than two per person, and that a set of rows larger than
 * PostgREST's page is fully read rather than silently truncated at 1000.
 *
 * Precedence is deliberately NOT restated here. It is asserted by delegating to
 * the same pure resolver the single-employment read uses, and a second copy of
 * those rules in a test would be the beginning of the divergence the module
 * exists to prevent. What IS asserted is that the delegation happens: an
 * `unavailable` exception must still win here.
 */
import { describe, expect, it } from "vitest";

import { fetchAvailabilityBatch } from "@/lib/staffAvailability/staffAvailabilityBatch";

type Row = Record<string, unknown>;

/** A chainable stand-in that records every table it was asked for. */
function fakeClient(tables: Record<string, Row[]>, calls: string[]) {
    return {
        from(table: string) {
            calls.push(table);
            const rows = tables[table] ?? [];
            const builder: Record<string, unknown> = {};
            for (const method of ["select", "eq", "in", "order", "gte", "lte"]) {
                builder[method] = () => builder;
            }
            builder.range = (from: number, to: number) =>
                Promise.resolve({ data: rows.slice(from, to + 1), error: null });
            return builder;
        },
    } as never;
}

const ORG = "org-1";
const EMP_A = "emp-a";
const EMP_B = "emp-b";
const MONDAY = "2027-05-03";

function window(employmentId: string, weekday: number, start: string, end: string): Row {
    return {
        id: `w-${employmentId}-${weekday}-${start}`,
        org_id: ORG,
        employment_id: employmentId,
        weekday,
        start_time: start,
        end_time: end,
        effective_start: "2020-01-01",
        effective_end: null,
        is_active: true,
    };
}

describe("availability batch", () => {
    it("answers for a whole site in two queries", async () => {
        const calls: string[] = [];
        const batch = await fetchAvailabilityBatch(
            fakeClient(
                {
                    staff_availability_windows: [
                        window(EMP_A, 1, "07:30:00", "16:30:00"),
                        window(EMP_B, 1, "09:00:00", "17:00:00"),
                    ],
                    staff_availability_exceptions: [],
                },
                calls
            ),
            { orgId: ORG, employmentIds: [EMP_A, EMP_B], dates: [MONDAY] }
        );

        expect(calls).toEqual(["staff_availability_windows", "staff_availability_exceptions"]);
        expect(batch.byEmployment.get(EMP_A)?.get(MONDAY)?.windows).toEqual([
            { start_time: "07:30:00", end_time: "16:30:00", source: "recurring", sourceId: `w-${EMP_A}-1-07:30:00` },
        ]);
        expect(batch.byEmployment.get(EMP_B)?.get(MONDAY)?.available).toBe(true);
    });

    it("still lets an unavailable exception win, because it does not reimplement precedence", async () => {
        const batch = await fetchAvailabilityBatch(
            fakeClient(
                {
                    staff_availability_windows: [window(EMP_A, 1, "07:30:00", "16:30:00")],
                    staff_availability_exceptions: [
                        {
                            id: "x-1",
                            org_id: ORG,
                            employment_id: EMP_A,
                            exception_date: MONDAY,
                            exception_kind: "unavailable",
                            start_time: null,
                            end_time: null,
                            reason: "sick",
                            is_active: true,
                        },
                    ],
                },
                []
            ),
            { orgId: ORG, employmentIds: [EMP_A], dates: [MONDAY] }
        );
        const resolved = batch.byEmployment.get(EMP_A)?.get(MONDAY);
        expect(resolved?.available).toBe(false);
        expect(resolved?.windows).toEqual([]);
        expect(resolved?.provenance.kind).toBe("exception_unavailable");
        expect(resolved?.provenance.supersededRecurringIds).toEqual([`w-${EMP_A}-1-07:30:00`]);
    });

    it("reads past the 1000-row page rather than truncating at it", async () => {
        const many = Array.from({ length: 1500 }, (_, i) =>
            window(`emp-${i}`, 1, "08:00:00", "12:00:00")
        );
        const batch = await fetchAvailabilityBatch(
            fakeClient({ staff_availability_windows: many, staff_availability_exceptions: [] }, []),
            {
                orgId: ORG,
                employmentIds: many.map((w) => String(w.employment_id)),
                dates: [MONDAY],
            }
        );
        expect(batch.windowCount).toBe(1500);
        // The employment beyond the first page must not read as unavailable.
        expect(batch.byEmployment.get("emp-1400")?.get(MONDAY)?.available).toBe(true);
    });

    it("gives an answer, not a gap, for an employment with no rows at all", async () => {
        const batch = await fetchAvailabilityBatch(
            fakeClient({ staff_availability_windows: [], staff_availability_exceptions: [] }, []),
            { orgId: ORG, employmentIds: [EMP_A], dates: [MONDAY] }
        );
        const resolved = batch.byEmployment.get(EMP_A)?.get(MONDAY);
        expect(resolved?.available).toBe(false);
        expect(resolved?.provenance.kind).toBe("no_pattern");
    });
});
