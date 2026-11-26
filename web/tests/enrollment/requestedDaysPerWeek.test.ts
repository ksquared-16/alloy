import { describe, expect, it } from "vitest";
import {
    parseRequestedDaysPerWeekInput,
    REQUESTED_DAYS_PER_WEEK_MAX,
    REQUESTED_DAYS_PER_WEEK_MIN,
} from "@/lib/enrollment/requestedDaysPerWeek";

describe("parseRequestedDaysPerWeekInput", () => {
    it("accepts empty / null as clear (no fabricated schedule)", () => {
        expect(parseRequestedDaysPerWeekInput(null)).toEqual({ ok: true, value: null });
        expect(parseRequestedDaysPerWeekInput("")).toEqual({ ok: true, value: null });
        expect(parseRequestedDaysPerWeekInput("  ")).toEqual({ ok: true, value: null });
        expect(parseRequestedDaysPerWeekInput(undefined)).toEqual({ ok: true, value: null });
    });

    it("accepts whole numbers within 1–7", () => {
        expect(parseRequestedDaysPerWeekInput(1)).toEqual({ ok: true, value: 1 });
        expect(parseRequestedDaysPerWeekInput(7)).toEqual({ ok: true, value: 7 });
        expect(parseRequestedDaysPerWeekInput("3")).toEqual({ ok: true, value: 3 });
        expect(parseRequestedDaysPerWeekInput(REQUESTED_DAYS_PER_WEEK_MIN)).toEqual({
            ok: true,
            value: REQUESTED_DAYS_PER_WEEK_MIN,
        });
        expect(parseRequestedDaysPerWeekInput(REQUESTED_DAYS_PER_WEEK_MAX)).toEqual({
            ok: true,
            value: REQUESTED_DAYS_PER_WEEK_MAX,
        });
    });

    it("rejects out of bounds without clamping/fabricating", () => {
        expect(parseRequestedDaysPerWeekInput(0).ok).toBe(false);
        expect(parseRequestedDaysPerWeekInput(8).ok).toBe(false);
        expect(parseRequestedDaysPerWeekInput(-1).ok).toBe(false);
        expect(parseRequestedDaysPerWeekInput("9").ok).toBe(false);
    });

    it("rejects non-whole / non-numeric input (does not invent a day count)", () => {
        expect(parseRequestedDaysPerWeekInput("abc").ok).toBe(false);
        expect(parseRequestedDaysPerWeekInput("3.5").ok).toBe(false);
        expect(parseRequestedDaysPerWeekInput(Number.NaN).ok).toBe(false);
        expect(parseRequestedDaysPerWeekInput(2.9)).toEqual({ ok: true, value: 2 });
    });
});
