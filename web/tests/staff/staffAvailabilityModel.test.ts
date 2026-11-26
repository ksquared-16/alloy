/**
 * AVAILABILITY IS A RULE PLUS ITS EXCEPTIONS, AND THE COMBINATION MUST BE DECIDABLE.
 *
 * The one thing a resolver like this must never do is guess. "Unavailable Friday"
 * beside a recurring Friday window has no additive answer, so the contract is
 * REPLACEMENT: an active exception replaces the pattern for that date. These tests
 * pin that, the fail-closed tie-break, and the effective-dating boundaries.
 *
 * Nothing here reads a clock. Every date is handed in as the organisation's own
 * calendar day, which is what lets the same assertions hold across a DST change.
 */
import { describe, expect, it } from "vitest";

import {
    isAvailableAt,
    recurringPatternOn,
    resolveAvailabilityForDate,
    weekdayOfYmd,
    windowAppliesOn,
    type StaffAvailabilityExceptionRow,
    type StaffAvailabilityWindowRow,
} from "@/lib/staffAvailability/staffAvailabilityModel";

const win = (o: Partial<StaffAvailabilityWindowRow> = {}): StaffAvailabilityWindowRow => ({
    id: o.id ?? "w1",
    org_id: "org-1",
    employment_id: "emp-1",
    weekday: o.weekday ?? 1,
    start_time: o.start_time ?? "07:30:00",
    end_time: o.end_time ?? "16:30:00",
    effective_start: o.effective_start ?? "2026-01-01",
    effective_end: o.effective_end ?? null,
    is_active: o.is_active ?? true,
});

const exc = (o: Partial<StaffAvailabilityExceptionRow> = {}): StaffAvailabilityExceptionRow => ({
    id: o.id ?? "e1",
    org_id: "org-1",
    employment_id: "emp-1",
    exception_date: o.exception_date ?? "2026-09-28",
    exception_kind: o.exception_kind ?? "unavailable",
    start_time: o.start_time ?? null,
    end_time: o.end_time ?? null,
    reason: o.reason ?? null,
    is_active: o.is_active ?? true,
});

// 2026-09-28 is a Monday; 2026-09-25 a Friday. Fixed so the tests cannot drift.
const MONDAY = "2026-09-28";
const FRIDAY = "2026-09-25";

describe("weekday resolution", () => {
    it("reads the weekday from the org's calendar day, not a local clock", () => {
        expect(weekdayOfYmd(MONDAY)).toBe(1);
        expect(weekdayOfYmd(FRIDAY)).toBe(5);
        expect(weekdayOfYmd("nonsense")).toBe(-1);
    });
});

describe("the recurring pattern", () => {
    it("applies on its weekday and not on others", () => {
        expect(windowAppliesOn(win({ weekday: 1 }), MONDAY)).toBe(true);
        expect(windowAppliesOn(win({ weekday: 1 }), FRIDAY)).toBe(false);
    });

    it("respects effective start, and treats effective end as INCLUSIVE", () => {
        // A pattern that ends today still applies today: an operator ending it
        // "as of the 28th" means the 28th is covered, not that it vanished at midnight.
        expect(windowAppliesOn(win({ effective_start: "2026-09-29" }), MONDAY)).toBe(false);
        expect(windowAppliesOn(win({ effective_end: MONDAY }), MONDAY)).toBe(true);
        expect(windowAppliesOn(win({ effective_end: "2026-09-27" }), MONDAY)).toBe(false);
    });

    it("an inactive row never applies", () => {
        expect(windowAppliesOn(win({ is_active: false }), MONDAY)).toBe(false);
    });

    it("several rows on one weekday are a split window, ordered by start", () => {
        const r = resolveAvailabilityForDate(
            [
                win({ id: "pm", start_time: "14:00:00", end_time: "18:00:00" }),
                win({ id: "am", start_time: "07:00:00", end_time: "11:00:00" }),
            ],
            [],
            MONDAY,
        );
        expect(r.available).toBe(true);
        expect(r.windows.map((w) => w.start_time)).toEqual(["07:00:00", "14:00:00"]);
        expect(r.windows.every((w) => w.source === "recurring")).toBe(true);
    });

    it("a future pattern does not apply yet, and does not destroy the current one", () => {
        const current = win({ id: "now", end_time: "16:30:00", effective_end: "2026-10-31" });
        const future = win({ id: "later", start_time: "10:00:00", end_time: "18:00:00", effective_start: "2026-11-01" });
        const today = resolveAvailabilityForDate([current, future], [], MONDAY);
        expect(today.windows.map((w) => w.sourceId)).toEqual(["now"]);
        const laterOn = resolveAvailabilityForDate([current, future], [], "2026-11-02");
        expect(laterOn.windows.map((w) => w.sourceId)).toEqual(["later"]);
    });

    it("no pattern in force reads as unavailable, distinguished from an exception", () => {
        const r = resolveAvailabilityForDate([win({ weekday: 3 })], [], MONDAY);
        expect(r.available).toBe(false);
        // "no_pattern" and "exception_unavailable" send an operator to different places.
        expect(r.provenance.kind).toBe("no_pattern");
    });
});

describe("exceptions REPLACE the pattern, never add to it", () => {
    it("an unavailable exception overrides a recurring window", () => {
        const r = resolveAvailabilityForDate([win()], [exc({ exception_date: MONDAY, reason: "Family" })], MONDAY);
        expect(r.available).toBe(false);
        expect(r.windows).toEqual([]);
        expect(r.provenance.kind).toBe("exception_unavailable");
        expect(r.provenance.reason).toBe("Family");
        // The pattern it overrode is still reported, so the card can explain itself.
        expect(r.provenance.supersededRecurringIds).toEqual(["w1"]);
    });

    it("an available exception grants a normally unavailable day", () => {
        const r = resolveAvailabilityForDate(
            [win({ weekday: 1 })],
            [exc({ exception_date: FRIDAY, exception_kind: "available", start_time: "12:00:00", end_time: "17:00:00" })],
            FRIDAY,
        );
        expect(r.available).toBe(true);
        expect(r.windows).toEqual([
            { start_time: "12:00:00", end_time: "17:00:00", source: "exception", sourceId: "e1" },
        ]);
    });

    it("a partial-day exception replaces the window rather than trimming it", () => {
        // 07:30-16:30 normally; available only until 14:00 that day.
        const r = resolveAvailabilityForDate(
            [win()],
            [exc({ exception_date: MONDAY, exception_kind: "available", start_time: "07:30:00", end_time: "14:00:00" })],
            MONDAY,
        );
        expect(r.windows).toHaveLength(1);
        expect(r.windows[0]!.end_time).toBe("14:00:00");
        expect(isAvailableAt(r, "13:30:00")).toBe(true);
        expect(isAvailableAt(r, "15:00:00")).toBe(false);
    });

    it("unavailable beats available on the same date — ties fail CLOSED", () => {
        // Offering someone a shift a colleague marked them unavailable for is the
        // worse error, so the blocking record wins.
        const r = resolveAvailabilityForDate(
            [win()],
            [
                exc({ id: "grant", exception_kind: "available", exception_date: MONDAY, start_time: "09:00:00", end_time: "12:00:00" }),
                exc({ id: "block", exception_kind: "unavailable", exception_date: MONDAY }),
            ],
            MONDAY,
        );
        expect(r.available).toBe(false);
        expect(r.provenance.exceptionId).toBe("block");
    });

    it("an exception on another date, or an inactive one, changes nothing", () => {
        const other = resolveAvailabilityForDate([win()], [exc({ exception_date: "2026-10-05" })], MONDAY);
        expect(other.available).toBe(true);
        const cancelled = resolveAvailabilityForDate([win()], [exc({ exception_date: MONDAY, is_active: false })], MONDAY);
        expect(cancelled.available).toBe(true);
        expect(cancelled.provenance.kind).toBe("recurring");
    });
});

describe("time-of-day membership", () => {
    it("is end-exclusive, as an operating window is read everywhere else", () => {
        const r = resolveAvailabilityForDate([win()], [], MONDAY);
        expect(isAvailableAt(r, "07:30:00")).toBe(true);
        expect(isAvailableAt(r, "16:29:59")).toBe(true);
        expect(isAvailableAt(r, "16:30:00")).toBe(false);
        expect(isAvailableAt(r, "07:29:59")).toBe(false);
    });
});

describe("DST is survived by storing local intent, not an instant", () => {
    // US DST ends 2026-11-01 and begins 2026-03-08, both Sundays. A Monday pattern
    // either side of each must read identically, because 07:30 local is 07:30 local.
    it.each([
        ["2026-03-09", "the Monday after spring forward"],
        ["2026-11-02", "the Monday after fall back"],
        ["2026-03-02", "the Monday before spring forward"],
        ["2026-10-26", "the Monday before fall back"],
    ])("%s (%s) resolves the same wall-clock window", (ymd) => {
        const r = resolveAvailabilityForDate([win({ weekday: 1 })], [], ymd);
        expect(weekdayOfYmd(ymd)).toBe(1);
        expect(r.available).toBe(true);
        expect(r.windows[0]).toMatchObject({ start_time: "07:30:00", end_time: "16:30:00" });
    });
});

describe("the pattern a card renders", () => {
    it("groups in-force rows by weekday and orders each day's windows", () => {
        const pattern = recurringPatternOn(
            [
                win({ id: "mon", weekday: 1 }),
                win({ id: "thu-pm", weekday: 4, start_time: "14:00:00", end_time: "18:00:00" }),
                win({ id: "thu-am", weekday: 4, start_time: "10:00:00", end_time: "12:00:00" }),
                win({ id: "expired", weekday: 2, effective_end: "2026-01-31" }),
            ],
            MONDAY,
        );
        expect([...pattern.keys()].sort()).toEqual([1, 4]);
        expect(pattern.get(4)!.map((w) => w.id)).toEqual(["thu-am", "thu-pm"]);
        // Wednesday unavailable is the ABSENCE of a row, not a row saying so.
        expect(pattern.has(3)).toBe(false);
    });
});
