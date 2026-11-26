/**
 * The schedule card's submission, read as Assignment Time.
 *
 * The card has always collected daily hours and a per-weekday override. They were
 * stored as schedule metadata and read back to the same card, so they LOOKED
 * saved — while the authority every temporal reader consults kept whatever the
 * pattern trigger seeded. Hours could be typed, echoed, and still reach the
 * staffing projection as unknown.
 *
 * This is the translation that ends that, so it is worth pinning precisely.
 */
import { describe, expect, it } from "vitest";

import { assignmentTimeDaysFromRequest } from "@/app/api/admin/scheduling/route";

describe("schedule submission → Assignment Time", () => {
    it("gives every chosen weekday the default hours", () => {
        expect(
            assignmentTimeDaysFromRequest([1, 2, 3], { default: { arrive: "08:30", depart: "16:00" }, perDay: {} })
        ).toEqual([
            { weekday: 1, startTime: "08:30", endTime: "16:00" },
            { weekday: 2, startTime: "08:30", endTime: "16:00" },
            { weekday: 3, startTime: "08:30", endTime: "16:00" },
        ]);
    });

    it("lets a per-day override beat the default, which is what the override means", () => {
        expect(
            assignmentTimeDaysFromRequest([1, 2, 3, 4, 5], {
                default: { arrive: "08:00", depart: "16:30" },
                perDay: { "2": { arrive: "09:00", depart: "17:30" }, "4": { arrive: "09:00", depart: "17:30" } },
            })
        ).toEqual([
            { weekday: 1, startTime: "08:00", endTime: "16:30" },
            { weekday: 2, startTime: "09:00", endTime: "17:30" },
            { weekday: 3, startTime: "08:00", endTime: "16:30" },
            { weekday: 4, startTime: "09:00", endTime: "17:30" },
            { weekday: 5, startTime: "08:00", endTime: "16:30" },
        ]);
    });

    it("keeps a recurring day with no hours as UNKNOWN rather than dropping it", () => {
        expect(assignmentTimeDaysFromRequest([1, 3], { default: null, perDay: {} })).toEqual([
            { weekday: 1, startTime: null, endTime: null },
            { weekday: 3, startTime: null, endTime: null },
        ]);
    });

    it("treats a backwards or malformed time as unknown rather than saving nonsense", () => {
        expect(assignmentTimeDaysFromRequest([1], { default: { arrive: "16:00", depart: "08:00" } })).toEqual([
            { weekday: 1, startTime: null, endTime: null },
        ]);
        expect(assignmentTimeDaysFromRequest([1], { default: { arrive: "8am", depart: "4pm" } })).toEqual([
            { weekday: 1, startTime: null, endTime: null },
        ]);
    });

    it("says nothing at all when no weekday was chosen", () => {
        expect(assignmentTimeDaysFromRequest([], { default: { arrive: "08:00", depart: "16:00" } })).toEqual([]);
        expect(assignmentTimeDaysFromRequest(null, null)).toEqual([]);
    });

    it("deduplicates and orders the week", () => {
        expect(assignmentTimeDaysFromRequest([5, 1, 1, 3], { default: null }).map((d) => d.weekday)).toEqual([1, 3, 5]);
    });

    it("ignores a weekday that is not a day", () => {
        expect(assignmentTimeDaysFromRequest([1, 7, -1, 9], { default: null }).map((d) => d.weekday)).toEqual([1]);
    });
});
