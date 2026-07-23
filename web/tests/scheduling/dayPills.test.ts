/**
 * Operating-days day-pill behavior — deterministic unit coverage.
 *
 * Replaces the flaky `scheduling-operating-days.spec.ts` E2E (which had to drive the
 * heavy opportunity drawer and intermittently crashed the renderer). The behavior that
 * matters — only operating days show, unselected operating days are grayed, weekends
 * hidden for a Mon–Fri site — is pure, so it is verified here in milliseconds.
 */

import { describe, it, expect } from "vitest";
import { resolveVisibleDayPills } from "@/lib/scheduling/dayPills";
import { allowedPatternWeekdays } from "@/lib/locations/locationSchedulingConfig";

describe("resolveVisibleDayPills", () => {
    it("North Campus (Mon–Fri) hides Sat/Sun and marks each operating day's selection", () => {
        const allowed = allowedPatternWeekdays([1, 2, 3, 4, 5]); // operating days
        const pills = resolveVisibleDayPills(allowed, [1, 2, 3, 4, 5]);
        expect(pills.map((p) => p.weekday)).toEqual([1, 2, 3, 4, 5]); // no 6 (Sat) or 0 (Sun)
        expect(pills.every((p) => p.selected)).toBe(true);
    });

    it("grays unselected operating days (shown but not selected)", () => {
        const allowed = allowedPatternWeekdays([1, 2, 3, 4, 5]);
        const pills = resolveVisibleDayPills(allowed, [1, 3, 5]); // M W F only
        expect(pills.map((p) => p.weekday)).toEqual([1, 2, 3, 4, 5]);
        expect(pills.filter((p) => p.selected).map((p) => p.weekday)).toEqual([1, 3, 5]);
        expect(pills.filter((p) => !p.selected).map((p) => p.weekday)).toEqual([2, 4]);
    });

    it("renders Monday-first with the weekend last", () => {
        const allowed = allowedPatternWeekdays([0, 1, 2, 3, 4, 5, 6]); // 7-day site
        const pills = resolveVisibleDayPills(allowed, []);
        expect(pills.map((p) => p.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
        expect(pills.map((p) => p.label)).toEqual(["M", "T", "W", "T", "F", "S", "S"]);
    });

    it("keeps a selected day that is outside operating days visible (removable, truthful)", () => {
        const allowed = allowedPatternWeekdays([1, 2, 3, 4, 5]);
        const pills = resolveVisibleDayPills(allowed, [1, 2, 3, 4, 5, 6]); // Sat was selected
        expect(pills.map((p) => p.weekday)).toEqual([1, 2, 3, 4, 5, 6]); // Sat shown, Sun still hidden
        expect(pills.find((p) => p.weekday === 6)?.selected).toBe(true);
    });

    it("with no operating-days config, shows every weekday (unconstrained fallback)", () => {
        // allowedPatternWeekdays([]) returns all 7 days → nothing is hidden.
        const pills = resolveVisibleDayPills(allowedPatternWeekdays([]), [1, 2, 3]);
        expect(pills.map((p) => p.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
        expect(pills.filter((p) => p.selected).map((p) => p.weekday)).toEqual([1, 2, 3]);
    });

    it("undefined allowed is treated as unconstrained (all weekdays)", () => {
        const pills = resolveVisibleDayPills(undefined, [2, 4]);
        expect(pills).toHaveLength(7);
        expect(pills.filter((p) => p.selected).map((p) => p.weekday)).toEqual([2, 4]);
    });
});
