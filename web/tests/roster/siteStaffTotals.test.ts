/**
 * P5 (Director, 2026-10-25): at site·date a staff member counts ONCE in the unique daily staff total;
 * at room grain the same person counts in every room they cover. The roster's site totals must not
 * sum room counts and call the result unique site staff.
 */

import { describe, expect, it } from "vitest";

import { siteStaffTotals } from "@/lib/roster/buildCombinedRoster";

type Cells = Parameters<typeof siteStaffTotals>[0];

const actual = (state: "present" | "checked_out" | "absent" | "no_record") => ({
    state,
    arrivedAt: null,
    departedAt: null,
    actualRoomLocationId: null,
    latestFactId: null,
});
const staff = (personId: string, state: "present" | "checked_out" | "absent" | "no_record" = "no_record") => ({
    personId,
    actual: actual(state),
});
const cell = (scheduled: ReturnType<typeof staff>[], unscheduled: ReturnType<typeof staff>[] = []) => ({
    staff: scheduled,
    unscheduledStaffPresent: unscheduled,
});
const totals = (cells: ReturnType<typeof cell>[]) => siteStaffTotals(cells as unknown as Cells);

describe("site staff totals count a person once per site·date (P5)", () => {
    it("a person scheduled in two rooms is one scheduled staff member at the site", () => {
        // Room A: Jane. Room B: Jane and Rae. Room cells count 1 and 2; the site has two people.
        expect(totals([cell([staff("jane")]), cell([staff("jane"), staff("rae")])]).scheduledStaff).toBe(2);
    });

    it("a present person scheduled in two rooms is one present staff member at the site", () => {
        const t = totals([cell([staff("jane", "present")]), cell([staff("jane", "present"), staff("rae")])]);
        expect(t.actualStaffPresent).toBe(1);
    });

    it("counts unscheduled presence once, and once only when the person is also scheduled elsewhere", () => {
        const t = totals([
            cell([staff("jane", "present")]),
            cell([], [staff("jane", "present"), staff("sam", "present")]),
        ]);
        expect(t.scheduledStaff).toBe(1);
        expect(t.actualStaffPresent).toBe(2);
    });

    it("distinct people in distinct rooms still add up", () => {
        const t = totals([cell([staff("jane", "present")]), cell([staff("rae", "checked_out")]), cell([])]);
        expect(t).toEqual({ scheduledStaff: 2, actualStaffPresent: 1 });
    });
});
