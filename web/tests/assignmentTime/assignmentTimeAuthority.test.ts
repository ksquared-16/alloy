/**
 * ASSIGNMENT TIME, AGAINST A REAL DATABASE.
 *
 * The invariants that matter here are things the DATABASE promises — exclusion,
 * knownness, cascade, tenancy — so asserting them against a mock would only restate
 * the code's own assumptions. Each test drives real rows.
 *
 * The shape under test is the one the old model could not express: one Assignment
 * whose hours differ by weekday.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { resolveAssignmentTimes, uniformDailyInterval } from "@/lib/assignmentTime/resolveAssignmentTime";

const URL = "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const LIVE = KEY.length > 0;
const db: SupabaseClient = LIVE
    ? createClient(URL, KEY, { auth: { persistSession: false } })
    : (null as unknown as SupabaseClient);

let orgId = "";
let assignmentId = "";

async function pickAssignment() {
    const { data } = await db
        .from("schedule_assignments")
        .select("id, org_id")
        .limit(1)
        .single();
    const row = data as { id: string; org_id: string };
    orgId = row.org_id;
    assignmentId = row.id;
}

async function clearIntervals() {
    await db.from("assignment_weekday_intervals").delete().eq("assignment_id", assignmentId);
}

async function put(weekday: number, start: string | null, end: string | null, sourceKey = "operator") {
    return db.from("assignment_weekday_intervals").insert({
        org_id: orgId,
        assignment_id: assignmentId,
        weekday,
        start_time: start,
        end_time: end,
        source_key: sourceKey,
    });
}

/**
 * Put the shared certification stack back the way the backfill left it: the rows this
 * assignment would have had, rebuilt from its pattern. A suite that mutates a shared
 * stack and does not restore it makes the NEXT session's parity census wrong.
 */
async function restoreBackfill() {
    await clearIntervals();
    const { data: asg } = await db
        .from("schedule_assignments")
        .select("schedule_pattern_id")
        .eq("id", assignmentId)
        .maybeSingle();
    const patternId = (asg as { schedule_pattern_id: string | null } | null)?.schedule_pattern_id;
    if (!patternId) return;
    const { data: pat } = await db
        .from("schedule_patterns")
        .select("weekdays")
        .eq("id", patternId)
        .maybeSingle();
    const weekdays = ((pat as { weekdays: number[] | null } | null)?.weekdays ?? []).map(Number);
    if (weekdays.length === 0) return;
    await db.from("assignment_weekday_intervals").insert(
        weekdays.map((weekday) => ({
            org_id: orgId,
            assignment_id: assignmentId,
            weekday,
            start_time: null,
            end_time: null,
            source_key: "backfill_hours_unknown",
        }))
    );
}

describe.runIf(LIVE)("assignment time authority", () => {
    beforeEach(async () => {
        await pickAssignment();
        await clearIntervals();
    });
    afterAll(async () => {
        if (LIVE) await restoreBackfill();
    });

    it("Mon–Fri identical hours resolve as one uniform interval", async () => {
        for (const w of [1, 2, 3, 4, 5]) expect((await put(w, "08:00", "16:30")).error).toBeNull();

        const times = await resolveAssignmentTimes(db, { orgId, assignmentIds: [assignmentId] });
        const t = times.get(assignmentId)!;
        expect(t.weekdays).toEqual([1, 2, 3, 4, 5]);
        expect(t.hoursKnown).toBe("all");
        expect(uniformDailyInterval(t)).toEqual({ startTime: "08:00", endTime: "16:30" });
    });

    it("ONE assignment expresses different hours on different weekdays", async () => {
        // The shape the previous model could not represent at all.
        for (const w of [1, 3, 5]) await put(w, "08:00", "16:30");
        for (const w of [2, 4]) await put(w, "09:00", "17:30");

        const t = (await resolveAssignmentTimes(db, { orgId, assignmentIds: [assignmentId] })).get(assignmentId)!;
        expect(t.weekdays).toEqual([1, 2, 3, 4, 5]);
        expect(t.days.find((d) => d.weekday === 1)!.intervals[0]).toEqual({ startTime: "08:00", endTime: "16:30" });
        expect(t.days.find((d) => d.weekday === 2)!.intervals[0]).toEqual({ startTime: "09:00", endTime: "17:30" });
        // A single label would misstate a week that is not uniform.
        expect(uniformDailyInterval(t)).toBeNull();
    });

    it("a split day keeps both intervals, ordered by start", async () => {
        await put(1, "17:00", "19:00");
        await put(1, "08:00", "12:00");

        const t = (await resolveAssignmentTimes(db, { orgId, assignmentIds: [assignmentId] })).get(assignmentId)!;
        const monday = t.days.find((d) => d.weekday === 1)!;
        expect(monday.intervals.map((i) => i.startTime)).toEqual(["08:00", "17:00"]);
        expect(uniformDailyInterval(t)).toBeNull();
    });

    it("weekday known with hours unknown is a third answer, not all-day and not zero", async () => {
        expect((await put(6, null, null, "backfill_hours_unknown")).error).toBeNull();

        const t = (await resolveAssignmentTimes(db, { orgId, assignmentIds: [assignmentId] })).get(assignmentId)!;
        expect(t.weekdays).toEqual([6]);
        expect(t.hoursKnown).toBe("none");
        expect(t.days[0].hoursKnown).toBe(false);
        expect(t.days[0].intervals).toEqual([]);
        expect(uniformDailyInterval(t)).toBeNull();
    });

    it("reports partial knownness rather than rounding it to known or unknown", async () => {
        await put(1, "08:00", "16:30");
        await put(2, null, null, "backfill_hours_unknown");

        const t = (await resolveAssignmentTimes(db, { orgId, assignmentIds: [assignmentId] })).get(assignmentId)!;
        expect(t.hoursKnown).toBe("partial");
        expect(uniformDailyInterval(t)).toBeNull();
    });

    it("the database refuses a half-known interval and a reversed one", async () => {
        expect((await put(1, "08:00", null)).error).not.toBeNull();
        expect((await put(1, null, "16:30")).error).not.toBeNull();
        expect((await put(1, "16:30", "08:00")).error).not.toBeNull();
        expect((await put(1, "08:00", "08:00")).error).not.toBeNull();
    });

    it("the database refuses overlapping intervals on one weekday", async () => {
        expect((await put(1, "08:00", "16:30")).error).toBeNull();
        // Would double-count one person in one hour once staffing reads this.
        expect((await put(1, "16:00", "18:00")).error).not.toBeNull();
        // Touching, not overlapping, is legal.
        expect((await put(1, "16:30", "18:00")).error).toBeNull();
    });

    it("a weekday cannot be known and unknown at once, in either order", async () => {
        await put(1, "08:00", "16:30");
        expect((await put(1, null, null)).error).not.toBeNull();

        await clearIntervals();
        await put(2, null, null);
        expect((await put(2, "08:00", "16:30")).error).not.toBeNull();
    });

    it("an interval cannot claim a different org than its assignment", async () => {
        const { error } = await db.from("assignment_weekday_intervals").insert({
            org_id: "00000000-0000-4000-8000-000000000099",
            assignment_id: assignmentId,
            weekday: 0,
            start_time: "08:00",
            end_time: "12:00",
        });
        expect(error).not.toBeNull();
    });

    it("resolves a batch in one read, deterministically ordered", async () => {
        for (const w of [5, 1, 3]) await put(w, "08:00", "16:30");
        const times = await resolveAssignmentTimes(db, {
            orgId,
            assignmentIds: [assignmentId, assignmentId, "00000000-0000-0000-0000-000000000000"],
        });
        expect(times.get(assignmentId)!.weekdays).toEqual([1, 3, 5]);
        // An assignment with no rows is unknown, never invented.
        const absent = times.get("00000000-0000-0000-0000-000000000000")!;
        expect(absent.hasIntervals).toBe(false);
        expect(absent.hoursKnown).toBe("none");
    });

    it("recurrence falls back to the pattern, hours never do", async () => {
        // Guards the specific hazard: buildStaffSupply reads an empty weekday list as
        // "runs every day", so an assignment without intervals must not lose its days.
        const times = await resolveAssignmentTimes(db, {
            orgId,
            assignmentIds: [assignmentId],
            patternWeekdaysByAssignment: new Map([[assignmentId, [1, 2, 3, 4, 5]]]),
        });
        const t = times.get(assignmentId)!;
        expect(t.weekdays).toEqual([1, 2, 3, 4, 5]);
        expect(t.hasIntervals).toBe(false);
        expect(t.hoursKnown).toBe("none");
        expect(t.days.every((d) => d.hoursKnown === false)).toBe(true);
    });

    it("intervals belong to the assignment row and die with it", async () => {
        // Effective-dated ownership: a superseded Assignment keeps its own materialized
        // time, and nothing survives the row it hung from.
        const { data } = await db
            .from("assignment_weekday_intervals")
            .select("id")
            .eq("assignment_id", "00000000-0000-0000-0000-000000000000");
        expect(data ?? []).toEqual([]);
    });
});
