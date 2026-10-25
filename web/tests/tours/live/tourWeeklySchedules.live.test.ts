/**
 * S3 — weekly tour schedules, certified against the REAL certification database (the shared local
 * `alloy-cert` stack; `.env.certification.local`).
 *
 * The suite runs in an organization it creates and removes, because organization-wide availability
 * contributes slots at every location of its org — authored on the shared synthetic tenant it would
 * leak into other lanes' suites.
 *
 * Proven through PostgREST, exactly as the routes drive the service:
 *   - one Mon–Fri, two-window schedule = ten rules; the canonical slot loader offers the expected times
 *   - editing it reconciles only its own rows: kept rule ids survive, an unrelated schedule and a
 *     legacy rule are byte-identical, and an existing booking is untouched
 *   - duplicating to another location copies configuration only (no bookings follow)
 *   - organization-wide schedules contribute slots at a location, and a location-scoped edit or
 *     delete of one finds nothing (the inherited rows are unchanged)
 *   - two schedules covering the same time offer it once
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

function certEnv(): { url: string; serviceKey: string } | null {
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (key: string) =>
            file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}

const env = certEnv();
const describeLive = env ? describe : describe.skip;

import { computeAvailableTourSlots } from "@/lib/tours/availability/computeAvailableTourSlots";
import { createTourSchedule, deleteTourSchedule, updateTourSchedule } from "@/lib/tours/schedules/tourScheduleWrites";
import { duplicateTourScheduleDraft, groupTourRulesIntoSchedules, type TourScheduleDraft } from "@/lib/tours/schedules/tourWeeklySchedule";

const RUN = `s3-${Date.now().toString(36)}`;
const TZ = "America/Los_Angeles";
// Mon 2027-01-11 .. Sun 2027-01-17 (PST, UTC-8).
const WEEK = { from: new Date("2027-01-11T08:00:00Z"), to: new Date("2027-01-18T08:00:00Z") };

const WEEKDAY_TOURS: TourScheduleDraft = {
    name: "Weekday tours",
    days: [1, 2, 3, 4, 5],
    windows: [
        { start_time: "08:30:00", end_time: "10:30:00" },
        { start_time: "14:30:00", end_time: "15:30:00" },
    ],
    timezone: TZ,
    slot_duration_minutes: 30,
    buffer_minutes: 0,
    max_bookings_per_slot: 2,
    approval_required: false,
    is_active: true,
};

function localDays(slots: { startAt: string }[]): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const s of slots) {
        const d = new Date(s.startAt);
        const day = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
        (out[day] ??= []).push(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d));
    }
    return out;
}

describeLive("S3 weekly tour schedules — live certification database", () => {
    const db = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    let orgId = "";
    let locA = "";
    let locB = "";
    let personId = "";
    let opportunityId = "";
    let weekdayId = "";
    let saturdayId = "";
    let legacyRuleId = "";
    let bookingId = "";

    async function ok<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
        const { data, error } = await p;
        if (error) throw new Error(error.message);
        return data;
    }
    const rulesAt = async (locationId: string | null) => {
        let q = db.from("tour_availability_rules").select("*").eq("org_id", orgId).order("id");
        q = locationId ? q.eq("location_id", locationId) : q.is("location_id", null);
        return (await ok(q)) as Array<Record<string, unknown> & { id: string; day_of_week: number; metadata: Record<string, unknown> }>;
    };
    const scheduleRows = async (locationId: string | null, scheduleId: string) =>
        (await rulesAt(locationId)).filter((r) => (r.metadata?.tour_schedule as { id?: string } | undefined)?.id === scheduleId);
    const slotsAt = (locationId: string) => computeAvailableTourSlots(db, { orgId, locationId, from: WEEK.from, to: WEEK.to });

    beforeAll(async () => {
        const org = await ok(db.from("orgs").insert({ name: `ZZ ${RUN}`, slug: `zz-${RUN}` }).select("id").single());
        orgId = (org as { id: string }).id;
        locA = ((await ok(db.from("locations").insert({ org_id: orgId, label: `ZZ ${RUN} A` }).select("id").single())) as { id: string }).id;
        locB = ((await ok(db.from("locations").insert({ org_id: orgId, label: `ZZ ${RUN} B` }).select("id").single())) as { id: string }).id;
        personId = ((await ok(
            db.from("persons").insert({ org_id: orgId, first_name: "Zz", last_name: RUN, email: `qa+${RUN}@example.invalid` }).select("id").single()
        )) as { id: string }).id;
        opportunityId = ((await ok(
            db
                .from("opportunities")
                .insert({ org_id: orgId, name: `ZZ ${RUN}`, location_id: locA, primary_person_id: personId, status_key: "open", stage_key: "lead" })
                .select("id")
                .single()
        )) as { id: string }).id;
    }, 60_000);

    afterAll(async () => {
        if (!orgId) return;
        await db.from("tour_bookings").delete().eq("org_id", orgId);
        await db.from("tour_availability_rules").delete().eq("org_id", orgId);
        await db.from("opportunities").delete().eq("org_id", orgId);
        await db.from("persons").delete().eq("org_id", orgId);
        await db.from("locations").delete().eq("org_id", orgId);
        const { error } = await db.from("orgs").delete().eq("id", orgId);
        if (error) throw new Error(`cert org ${orgId} not removed: ${error.message}`);
    }, 60_000);

    it("a Mon–Fri, two-window schedule is ten rules and offers the expected week", async () => {
        const created = await createTourSchedule(db, { orgId, locationId: locA }, WEEKDAY_TOURS);
        expect(created.ok).toBe(true);
        if (!created.ok) return;
        weekdayId = created.scheduleId;
        expect(created.rules).toHaveLength(10);

        const byDay = localDays(await slotsAt(locA));
        expect(Object.keys(byDay).sort()).toEqual(["2027-01-11", "2027-01-12", "2027-01-13", "2027-01-14", "2027-01-15"]);
        for (const times of Object.values(byDay)) expect(times).toEqual(["8:30 AM", "9:00 AM", "9:30 AM", "10:00 AM", "2:30 PM", "3:00 PM"]);
    });

    it("nonconsecutive days author as one schedule too", async () => {
        const created = await createTourSchedule(
            db,
            { orgId, locationId: locA },
            { ...WEEKDAY_TOURS, name: "Saturday open house", days: [6], windows: [{ start_time: "10:00:00", end_time: "11:00:00" }] }
        );
        expect(created.ok).toBe(true);
        if (created.ok) saturdayId = created.scheduleId;
        const legacy = await ok(
            db
                .from("tour_availability_rules")
                .insert({
                    org_id: orgId, location_id: locA, day_of_week: 0, start_time: "13:00", end_time: "14:00", timezone: TZ,
                    slot_duration_minutes: 60, buffer_minutes: 0, max_bookings_per_slot: 1, approval_required: true, is_active: true,
                    metadata: { cert_run: RUN },
                })
                .select("id")
                .single()
        );
        legacyRuleId = (legacy as { id: string }).id;
        const groups = groupTourRulesIntoSchedules((await rulesAt(locA)) as never, locA);
        expect(groups.map((g) => g.name).sort()).toEqual(["Saturday open house", "Sunday window", "Weekday tours"]);
    });

    it("editing the weekday schedule touches only its own rows, and the booking survives", async () => {
        const monday830 = (await scheduleRows(locA, weekdayId)).find((r) => r.day_of_week === 1 && r.start_time === "08:30:00")!;
        const booking = await ok(
            db
                .from("tour_bookings")
                .insert({
                    org_id: orgId, opportunity_id: opportunityId, location_id: locA, primary_person_id: personId,
                    start_at: "2027-01-11T16:30:00Z", end_at: "2027-01-11T17:00:00Z", timezone: TZ,
                    status_key: "confirmed", source: "admin", metadata: { rule_id: monday830.id, slot_capacity: 2 },
                })
                .select("*")
                .single()
        );
        bookingId = (booking as { id: string }).id;
        const saturdayBefore = await scheduleRows(locA, saturdayId);
        const legacyBefore = (await rulesAt(locA)).find((r) => r.id === legacyRuleId);
        const keptBefore = (await scheduleRows(locA, weekdayId)).filter((r) => r.day_of_week !== 5).map((r) => r.id).sort();

        // Drop Friday, raise capacity.
        const updated = await updateTourSchedule(db, { orgId, locationId: locA }, weekdayId, {
            ...WEEKDAY_TOURS,
            days: [1, 2, 3, 4],
            max_bookings_per_slot: 3,
        });
        expect(updated.ok).toBe(true);

        const after = await scheduleRows(locA, weekdayId);
        expect(after).toHaveLength(8);
        expect(after.map((r) => r.id).sort()).toEqual(keptBefore); // ids preserved, nothing reinserted
        expect(after.every((r) => r.max_bookings_per_slot === 3)).toBe(true);
        expect(await scheduleRows(locA, saturdayId)).toEqual(saturdayBefore);
        expect((await rulesAt(locA)).find((r) => r.id === legacyRuleId)).toEqual(legacyBefore);
        const bookingAfter = await ok(db.from("tour_bookings").select("*").eq("id", bookingId).single());
        expect(bookingAfter).toEqual(booking);

        const slots = await slotsAt(locA);
        expect(Object.keys(localDays(slots))).not.toContain("2027-01-15");
        // The booked Monday 8:30 now has 2 of 3 left.
        expect(slots.find((s) => s.startAt === "2027-01-11T16:30:00.000Z")?.remainingCapacity).toBe(2);
    });

    it("duplicating to another location copies configuration, never bookings", async () => {
        const [group] = groupTourRulesIntoSchedules((await scheduleRows(locA, weekdayId)) as never, locA);
        const copy = await createTourSchedule(db, { orgId, locationId: locB }, duplicateTourScheduleDraft(group!));
        expect(copy.ok).toBe(true);
        if (!copy.ok) return;
        expect(copy.scheduleId).not.toBe(weekdayId);
        const rows = await scheduleRows(locB, copy.scheduleId);
        expect(rows).toHaveLength(8);
        expect(rows.every((r) => r.location_id === locB && r.max_bookings_per_slot === 3)).toBe(true);
        const bookingsAtB = await ok(db.from("tour_bookings").select("id").eq("org_id", orgId).eq("location_id", locB));
        expect(bookingsAtB).toEqual([]);
        // The copy's Monday 8:30 is fully open: the source location's booking did not follow.
        const slotsB = await slotsAt(locB);
        expect(slotsB.find((s) => s.startAt === "2027-01-11T16:30:00.000Z")?.remainingCapacity).toBe(3);
    });

    it("organization-wide schedules contribute at a location and cannot be edited from it", async () => {
        const orgWide = await createTourSchedule(
            db,
            { orgId, locationId: null },
            { ...WEEKDAY_TOURS, name: "Org Sunday", days: [0], windows: [{ start_time: "09:00:00", end_time: "10:00:00" }] }
        );
        expect(orgWide.ok).toBe(true);
        if (!orgWide.ok) return;
        const sunday = localDays(await slotsAt(locB))["2027-01-17"];
        expect(sunday).toEqual(["9:00 AM", "9:30 AM"]);

        const before = await rulesAt(null);
        const editFromLocation = await updateTourSchedule(db, { orgId, locationId: locB }, orgWide.scheduleId, { ...WEEKDAY_TOURS, name: "Hijack" });
        expect(editFromLocation).toMatchObject({ ok: false, status: 404 });
        const deleteFromLocation = await deleteTourSchedule(db, { orgId, locationId: locB }, orgWide.scheduleId);
        expect(deleteFromLocation).toMatchObject({ ok: false, status: 404 });
        expect(await rulesAt(null)).toEqual(before);

        expect(await deleteTourSchedule(db, { orgId, locationId: null }, orgWide.scheduleId)).toMatchObject({ ok: true, deleted: 1 });
    });

    it("two schedules covering the same time offer it once, and the overlap is reported", async () => {
        const overlapping = await createTourSchedule(
            db,
            { orgId, locationId: locA },
            { ...WEEKDAY_TOURS, name: "Monday extra", days: [1], windows: [{ start_time: "08:30:00", end_time: "09:00:00" }] }
        );
        expect(overlapping.ok).toBe(true);
        if (!overlapping.ok) return;
        expect(overlapping.overlaps.length).toBeGreaterThan(0);
        const monday830 = (await slotsAt(locA)).filter((s) => s.startAt === "2027-01-11T16:30:00.000Z");
        expect(monday830).toHaveLength(1);
    });

    it("deleting a schedule removes its rules and leaves the booking", async () => {
        expect(await deleteTourSchedule(db, { orgId, locationId: locA }, weekdayId)).toMatchObject({ ok: true, deleted: 8 });
        const booking = await ok(db.from("tour_bookings").select("id, status_key").eq("id", bookingId).single());
        expect(booking).toEqual({ id: bookingId, status_key: "confirmed" });
    });
});
