/**
 * WRITE-PATH CONVERGENCE, AGAINST A REAL DATABASE.
 *
 * Seeding happens in a trigger, so an Assignment and its intervals are written in one
 * statement. That is the whole point: supabase-js has no multi-statement transaction,
 * and an application-side "insert Assignment, then insert intervals" has a failure
 * window in which an operator sees a successful save whose hours do not exist.
 *
 * These tests also cover the KNOWN-HOURS materialization path, which the certification
 * stack cannot exercise naturally — every pattern there has empty metadata. The
 * specimens below plant real pattern hours so the branch is proven deterministically
 * rather than assumed from staging.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

import { resolveAssignmentTimes, uniformDailyInterval } from "@/lib/assignmentTime/resolveAssignmentTime";

const URL = "http://127.0.0.1:54421";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const LIVE = KEY.length > 0;
const db: SupabaseClient = LIVE
    ? createClient(URL, KEY, { auth: { persistSession: false } })
    : (null as unknown as SupabaseClient);

const TAG = "qa_assignment_time_writepath";
let orgId = "";
let siteId = "";
let personId = "";
/** Staff assignments are guarded by covering employment, so the date comes from one. */
let startDate = "";
const createdPatterns: string[] = [];
const createdAssignments: string[] = [];

async function seedPattern(metadata: Record<string, unknown>, weekdays: number[]): Promise<string> {
    const { data, error } = await db
        .from("schedule_patterns")
        .insert({
            org_id: orgId,
            site_location_id: siteId,
            key: `${TAG}_${randomUUID().slice(0, 8)}`,
            label: TAG,
            schedule_type_key: "full_day",
            weekdays,
            metadata,
        })
        .select("id")
        .single();
    if (error) throw new Error(`seedPattern: ${error.message}`);
    const id = (data as { id: string }).id;
    createdPatterns.push(id);
    return id;
}

/** A staff Assignment: the shape that needs no enrollment agreement. */
async function createAssignment(patternId: string): Promise<string> {
    const { data, error } = await db
        .from("schedule_assignments")
        .insert({
            org_id: orgId,
            subject_type: "staff",
            subject_person_id: personId,
            site_location_id: siteId,
            schedule_pattern_id: patternId,
            start_date: startDate,
            end_date: null,
            status: "active",
            commitment_kind: "committed",
            source_key: TAG,
        })
        .select("id")
        .single();
    if (error) throw new Error(`createAssignment: ${error.message}`);
    const id = (data as { id: string }).id;
    createdAssignments.push(id);
    return id;
}

async function timeFor(assignmentId: string) {
    const times = await resolveAssignmentTimes(db, { orgId, assignmentIds: [assignmentId] });
    return times.get(assignmentId)!;
}

describe.runIf(LIVE)("assignment time — write-path convergence", () => {
    beforeEach(async () => {
        const { data } = await db
            .from("schedule_assignments")
            .select("org_id, site_location_id, subject_person_id")
            .eq("subject_type", "staff")
            .not("subject_person_id", "is", null)
            .limit(1)
            .single();
        const row = data as { org_id: string; site_location_id: string; subject_person_id: string };
        orgId = row.org_id;
        siteId = row.site_location_id;
        personId = row.subject_person_id;

        // The ledger refuses a staff assignment whose start is not covered by an
        // employment, so the fixture takes its date from the real one rather than
        // inventing a date the guard would reject.
        const { data: emp } = await db
            .from("employments")
            .select("start_date")
            .eq("org_id", orgId)
            .eq("person_id", personId)
            .neq("employment_status", "canceled")
            .order("start_date", { ascending: true })
            .limit(1)
            .single();
        startDate = (emp as { start_date: string }).start_date;
    });

    afterEach(async () => {
        for (const id of createdAssignments.splice(0)) {
            await db.from("schedule_assignments").delete().eq("id", id);
        }
        for (const id of createdPatterns.splice(0)) {
            await db.from("schedule_patterns").delete().eq("id", id);
        }
    });

    it("creating from a pattern with hours materializes those hours", async () => {
        const patternId = await seedPattern({ default_hours: { arrive: "08:00", depart: "16:30" } }, [1, 2, 3, 4, 5]);
        const assignmentId = await createAssignment(patternId);

        const t = await timeFor(assignmentId);
        expect(t.hasIntervals).toBe(true);
        expect(t.weekdays).toEqual([1, 2, 3, 4, 5]);
        expect(t.hoursKnown).toBe("all");
        expect(uniformDailyInterval(t)).toEqual({ startTime: "08:00", endTime: "16:30" });
        expect(t.sourceKeys).toEqual(["pattern_seed"]);
    });

    it("creating from a pattern WITHOUT hours preserves unknown rather than inventing them", async () => {
        const patternId = await seedPattern({}, [1, 3, 5]);
        const assignmentId = await createAssignment(patternId);

        const t = await timeFor(assignmentId);
        expect(t.hasIntervals).toBe(true);
        expect(t.weekdays).toEqual([1, 3, 5]);
        expect(t.hoursKnown).toBe("none");
        expect(uniformDailyInterval(t)).toBeNull();
        expect(t.sourceKeys).toEqual(["pattern_seed_hours_unknown"]);
    });

    it("the Assignment and its intervals arrive together — no window with one and not the other", async () => {
        const patternId = await seedPattern({ default_hours: { arrive: "07:30", depart: "18:00" } }, [2, 4]);
        const assignmentId = await createAssignment(patternId);

        // The very first read after the insert already sees interval truth, because the
        // seed ran in the same statement rather than in a second round trip.
        const { data } = await db
            .from("assignment_weekday_intervals")
            .select("weekday")
            .eq("assignment_id", assignmentId);
        expect((data ?? []).length).toBe(2);
    });

    it("explicit Assignment hours are not overwritten by the pattern default", async () => {
        const patternId = await seedPattern({ default_hours: { arrive: "08:00", depart: "16:30" } }, [1, 2]);
        const assignmentId = await createAssignment(patternId);

        // An explicit authoring path replaces the seeded rows.
        await db.from("assignment_weekday_intervals").delete().eq("assignment_id", assignmentId);
        await db.from("assignment_weekday_intervals").insert([
            { org_id: orgId, assignment_id: assignmentId, weekday: 1, start_time: "09:00", end_time: "17:30", source_key: "operator" },
            { org_id: orgId, assignment_id: assignmentId, weekday: 2, start_time: "09:00", end_time: "17:30", source_key: "operator" },
        ]);

        // Re-running the seed must not revert an operator decision to a template.
        await db.from("schedule_assignments").update({ source_key: `${TAG}_touch` }).eq("id", assignmentId);

        const t = await timeFor(assignmentId);
        expect(uniformDailyInterval(t)).toEqual({ startTime: "09:00", endTime: "17:30" });
        expect(t.sourceKeys).toEqual(["operator"]);
    });

    it("editing the reusable pattern does NOT rewrite an Assignment already materialized", async () => {
        const patternId = await seedPattern({ default_hours: { arrive: "08:00", depart: "16:30" } }, [1, 2, 3]);
        const assignmentId = await createAssignment(patternId);
        expect(uniformDailyInterval(await timeFor(assignmentId))).toEqual({ startTime: "08:00", endTime: "16:30" });

        // The template changes for FUTURE assignments; history stays put.
        await db
            .from("schedule_patterns")
            .update({ metadata: { default_hours: { arrive: "06:00", depart: "20:00" } } })
            .eq("id", patternId);

        const after = await timeFor(assignmentId);
        expect(uniformDailyInterval(after)).toEqual({ startTime: "08:00", endTime: "16:30" });
    });

    it("changing an Assignment's pattern re-materializes it, because recurrence changed", async () => {
        const first = await seedPattern({ default_hours: { arrive: "08:00", depart: "16:30" } }, [1, 2, 3, 4, 5]);
        const second = await seedPattern({ default_hours: { arrive: "09:00", depart: "17:30" } }, [2, 4]);
        const assignmentId = await createAssignment(first);
        expect((await timeFor(assignmentId)).weekdays).toEqual([1, 2, 3, 4, 5]);

        await db.from("schedule_assignments").update({ schedule_pattern_id: second }).eq("id", assignmentId);

        const after = await timeFor(assignmentId);
        expect(after.weekdays).toEqual([2, 4]);
        expect(uniformDailyInterval(after)).toEqual({ startTime: "09:00", endTime: "17:30" });
    });

    it("a superseded Assignment keeps its own interval rows", async () => {
        const patternId = await seedPattern({ default_hours: { arrive: "08:00", depart: "16:30" } }, [1]);
        const older = await createAssignment(patternId);
        const newer = await createAssignment(patternId);

        // Two Assignment versions, two independent materializations.
        await db.from("assignment_weekday_intervals").delete().eq("assignment_id", newer);
        await db.from("assignment_weekday_intervals").insert({
            org_id: orgId, assignment_id: newer, weekday: 1, start_time: "10:00", end_time: "14:00", source_key: "operator",
        });

        expect(uniformDailyInterval(await timeFor(older))).toEqual({ startTime: "08:00", endTime: "16:30" });
        expect(uniformDailyInterval(await timeFor(newer))).toEqual({ startTime: "10:00", endTime: "14:00" });
    });
});
