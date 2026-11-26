/**
 * The shape of the read, guarded.
 *
 * The Day view cost 2.7 seconds and almost none of it was work — it was waiting.
 * Three reads sat inside the day loop and ran once per day, and two more waited
 * on results they share no input with. The fix is easy to undo by accident: a
 * later author needing one more fact for a day will reach for the day loop,
 * because that is where the day is.
 *
 * So the rule is asserted rather than remembered. No `await` inside the loop
 * means every read is asked for the whole window before it starts, which is the
 * property that keeps a month costing the same round trips as a day.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SOURCE = resolve(__dirname, "../../lib/staffingProjection/fetchStaffingProjection.ts");

function dayLoopBody(src: string): string {
    const start = src.indexOf("for (const date of dates) {");
    expect(start, "the day loop must still exist").toBeGreaterThan(-1);
    return src.slice(start);
}

describe("the projection reads once for the window", () => {
    const src = readFileSync(SOURCE, "utf8");

    it("issues no read inside the day loop", () => {
        const body = dayLoopBody(src).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        const awaits = body.split("\n").filter((l) => /\bawait\b/.test(l));
        expect(awaits, `found ${awaits.length} await(s) in the day loop`).toEqual([]);
    });

    it("asks Coverage and Attendance for the whole range, not a day at a time", () => {
        expect(src).toContain("dateFrom: dateStart");
        expect(src).toContain("dateTo: dateEnd");
        expect(src).toContain("serviceDateStart: dateStart");
        expect(src).toContain("serviceDateEnd: dateEnd");
    });

    it("does not make independent reads wait on each other", () => {
        // The timezone, the expectation inputs and the supply read share no input.
        expect(src).toMatch(/const \[timeZone, loaded, supply\] = await Promise\.all\(/);
    });

    it("still asks each authority through the function that owns it", () => {
        for (const owner of [
            "buildStaffSupply",
            "resolveAssignmentTimes",
            "effectiveCoverageForSite",
            "listStaffPresenceForSiteDate",
            "listAttendanceEvents",
            "fetchAvailabilityBatch",
        ]) {
            expect(src, `${owner} must remain the read`).toContain(owner);
        }
        // And never by querying those tables itself.
        for (const table of ["staff_coverage_allocations", "child_attendance_events", "staff_presence_events"]) {
            expect(src, `must not query ${table} directly`).not.toContain(`from("${table}")`);
        }
    });
});
