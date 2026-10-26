/**
 * S6 — Tour availability under the Operating Calendar, against the REAL certification database
 * (`alloy-cert`; `.env.certification.local`): the canonical slot loader, the real booking writers,
 * the S1 capacity trigger, and calendar entries authored through the real ledger intake.
 *
 * Throwaway organization (an organization default reaches every location of its org). The ledger
 * is append-only, so the suite withdraws its entries (inert residue) and leaves the org row; every
 * other row it created is removed.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { computeAvailableTourSlots } from "@/lib/tours/availability/computeAvailableTourSlots";
import { createTourBooking, rescheduleTourBooking } from "@/lib/tours/bookings/tourBookingService";
import { isTourSlotCapacityConflict } from "@/lib/tours/bookings/tourSlotCapacity";
import { listCalendarAffectedTourBookings } from "@/lib/tours/calendar/tourCalendarAttention";
import { createSupabaseAuthoringGateway } from "@/lib/operationalExpectations/intake/supabaseAuthoringGateway";
import { commitCalendarAct, prepareCalendarAct, type CalendarAuthoringAction } from "@/lib/operatingCalendar/operatingCalendarAuthoring";
import { OPERATING_CALENDAR_PURPOSE, type OperatingCalendarEntryDraft } from "@/lib/operatingCalendar/operatingCalendarVocabulary";

function certEnv(): { url: string; serviceKey: string } | null {
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (key: string) => file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}

const env = certEnv();
const describeLive = env ? describe : describe.skip;
if (env) {
    process.env.SUPABASE_URL ||= env.url;
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= env.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= env.serviceKey;
}
const RUN = `s6-${Date.now().toString(36)}`;
const ACTOR = "00000000-0000-4000-8000-0000000006a6";
const TZ = "America/Los_Angeles";
// Tue 2033-03-01 .. Fri 2033-03-04, all PST (UTC-8): 09:00 local = 17:00Z.
const WEEK = { from: new Date("2033-03-01T08:00:00Z"), to: new Date("2033-03-05T08:00:00Z") };
const at = (date: string, hhmm: string) => new Date(`${date}T${String(Number(hhmm.slice(0, 2)) + 8).padStart(2, "0")}:${hhmm.slice(3)}:00.000Z`);

describeLive("S6 tour availability under the Operating Calendar — live certification database", () => {
    const db = (env ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null) as unknown as SupabaseClient;
    let orgId = "";
    let siteA = "";
    let siteB = "";
    const latest = new Map<string, string>();
    const access = { permissionKeys: ["settings.manage"], dim: { departmentScope: "all", allowedDepartmentIds: [], siteScope: "all", allowedSiteLocationIds: [] } } as never;

    async function ok<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
        const { data, error } = await p;
        if (error) throw new Error(error.message);
        return data;
    }

    async function act(action: CalendarAuthoringAction, opts: { draft?: Partial<OperatingCalendarEntryDraft>; entryId?: string }) {
        const draft = opts.draft
            ? ({ scope: "location", locationId: siteA, name: "Entry", designation: "closure", effect: "closed", fromDate: "2033-03-01", toDate: "2033-03-01", startTime: null, endTime: null, reasonKey: null, note: null, ...opts.draft } as OperatingCalendarEntryDraft)
            : null;
        const prepared = await prepareCalendarAct({ supabase: db, orgId, actorUserId: ACTOR, access, action, draft, entryId: opts.entryId ?? null, idempotencyKey: `${RUN}:${Math.random().toString(36).slice(2)}` });
        if (prepared.status !== "prepared") throw new Error(`${prepared.code}: ${prepared.message}`);
        const r = await commitCalendarAct(prepared, { orgId, actorUserId: ACTOR }, createSupabaseAuthoringGateway(db as never, OPERATING_CALENDAR_PURPOSE));
        if (r.status !== "authored") throw new Error(`authoring ${r.status}`);
        latest.set(r.act.lineageRootId ?? r.act.id, r.act.id);
        return r.act.id;
    }

    async function family(n: number) {
        const person = (await ok(db.from("persons").insert({ org_id: orgId, first_name: "Zz", last_name: `${RUN}-${n}`, email: `qa+${RUN}-${n}@example.invalid` }).select("id").single())) as { id: string };
        const opp = (await ok(
            db.from("opportunities").insert({ org_id: orgId, name: `ZZ ${RUN} ${n}`, location_id: siteA, primary_person_id: person.id, status_key: "open", stage_key: "lead" }).select("id").single(),
        )) as { id: string };
        return { personId: person.id, opportunityId: opp.id };
    }

    const book = (fam: { personId: string; opportunityId: string }, date: string, hhmm: string, over: Record<string, unknown> = {}) => {
        const startAt = at(date, hhmm);
        return createTourBooking(db, {
            orgId,
            opportunityId: fam.opportunityId,
            locationId: siteA,
            startAt,
            endAt: new Date(startAt.getTime() + 30 * 60_000),
            timezone: TZ,
            source: "admin",
            requestedByUserId: null,
            primaryPersonId: fam.personId,
            approvalRequired: false,
            deferConfirmationComms: true,
            ...over,
        } as never);
    };

    const offered = async (site: string, date?: string) => {
        const slots = await computeAvailableTourSlots(db, { orgId, locationId: site, from: WEEK.from, to: WEEK.to });
        const fmt = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
        const out = slots.map((s) => fmt(s.startAt).replace(", ", " "));
        return date ? out.filter((s) => s.startsWith(date)).map((s) => s.slice(11)) : out;
    };
    const ALL = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"];

    beforeAll(async () => {
        orgId = ((await ok(db.from("orgs").insert({ name: `ZZ ${RUN}`, slug: `zz-${RUN}` }).select("id").single())) as { id: string }).id;
        await ok(db.from("org_settings").upsert({ org_id: orgId, metadata: { timezone: TZ } }, { onConflict: "org_id" }));
        for (const label of ["A", "B"]) {
            const id = ((await ok(db.from("locations").insert({ org_id: orgId, label: `ZZ ${RUN} ${label}`, location_type: "site", metadata: { timezone: TZ } }).select("id").single())) as { id: string }).id;
            if (label === "A") siteA = id;
            else siteB = id;
        }
        // The S3 shape: weekday rules at each site (Mon–Fri 09:00–12:00, 30-minute tours, one family each).
        for (const loc of [siteA, siteB]) {
            for (const day of [1, 2, 3, 4, 5]) {
                await ok(
                    db.from("tour_availability_rules").insert({
                        org_id: orgId, location_id: loc, day_of_week: day, start_time: "09:00", end_time: "12:00", timezone: TZ,
                        slot_duration_minutes: 30, buffer_minutes: 0, max_bookings_per_slot: 1, approval_required: false, is_active: true,
                        metadata: { tour_schedule: { id: `${RUN}-${loc}`, name: "Weekday tours" } },
                    }),
                );
            }
        }
    }, 120_000);

    afterAll(async () => {
        if (!orgId) return;
        for (const id of latest.values()) await act("withdraw", { entryId: id }).catch(() => undefined);
        await db.from("tour_bookings").delete().eq("org_id", orgId);
        await db.from("tour_availability_rules").delete().eq("org_id", orgId);
        await db.from("opportunities").delete().eq("org_id", orgId);
        await db.from("persons").delete().eq("org_id", orgId);
        await db.from("locations").delete().eq("org_id", orgId);
        await db.from("org_settings").delete().eq("org_id", orgId);
    }, 120_000);

    it("with no calendar entries the S3 weekday schedule is offered unchanged", async () => {
        expect(await offered(siteA, "2033-03-01")).toEqual(ALL);
        expect((await offered(siteA)).length).toBe(24);
    });

    it("a holiday that does not close the location suppresses nothing", async () => {
        await act("create", { draft: { name: "Founders' Day", designation: "holiday", effect: "none", fromDate: "2033-03-01", toDate: "2033-03-04" } });
        expect((await offered(siteA)).length).toBe(24);
    });

    it("a full-day closure removes every slot that day, at that location only", async () => {
        await act("create", { draft: { name: "Closed Tuesday", fromDate: "2033-03-01", toDate: "2033-03-01" } });
        expect(await offered(siteA, "2033-03-01")).toEqual([]);
        expect(await offered(siteA, "2033-03-02")).toEqual(ALL);
        expect(await offered(siteB, "2033-03-01")).toEqual(ALL);
    });

    it("a partial closure removes only the overlapping slots", async () => {
        await act("create", { draft: { name: "Fire drill", effect: "partial_closure", startTime: "10:00", endTime: "11:00", fromDate: "2033-03-02", toDate: "2033-03-02" } });
        expect(await offered(siteA, "2033-03-02")).toEqual(["09:00", "09:30", "11:00", "11:30"]);
    });

    it("modified hours keep only slots wholly inside them", async () => {
        await act("create", { draft: { name: "Short day", designation: "modified_hours", effect: "modified_hours", startTime: "09:00", endTime: "10:15", fromDate: "2033-03-03", toDate: "2033-03-03" } });
        // 10:00–10:30 runs past 10:15, so it goes too.
        expect(await offered(siteA, "2033-03-03")).toEqual(["09:00", "09:30"]);
    });

    it("an organization closure reaches every site; a location exception reopens one", async () => {
        await act("create", { draft: { scope: "organization", locationId: null, name: "Org day", fromDate: "2033-03-04", toDate: "2033-03-04" } });
        expect(await offered(siteB, "2033-03-04")).toEqual([]);
        await act("create", { draft: { locationId: siteB, name: "B stays open", designation: "other", effect: "open_as_usual", fromDate: "2033-03-04", toDate: "2033-03-04" } });
        expect(await offered(siteB, "2033-03-04")).toEqual(ALL);
        expect(await offered(siteA, "2033-03-04")).toEqual([]);
    });

    it("every booking writer refuses a closed time", async () => {
        const fam = await family(1);
        await expect(book(fam, "2033-03-01", "09:00")).rejects.toThrow(/not available/);
        await expect(book(fam, "2033-03-01", "09:00", { approvalRequired: true })).rejects.toThrow(/not available/);
        await expect(book(fam, "2033-03-01", "09:00", { initialStatus: "requested", approvalRequired: true })).rejects.toThrow(/not operating at that time/);
        await expect(book(fam, "2033-03-02", "10:00")).rejects.toThrow(/not available/);
        const rows = (await ok(db.from("tour_bookings").select("id").eq("opportunity_id", fam.opportunityId))) as unknown[];
        expect(rows).toEqual([]);
    });

    it("existing bookings survive a new closure, become visible, keep their capacity, and reopen restores the rest", async () => {
        // Book Wednesday 11:30 while it is open.
        const fam = await family(2);
        const booking = await book(fam, "2033-03-02", "11:30");
        const before = await ok(db.from("tour_bookings").select("*").eq("id", booking.id).single());
        const messagesBefore = ((await ok(db.from("communication_messages").select("id").eq("org_id", orgId))) as unknown[]).length;

        const closure = await act("create", { draft: { name: "Burst pipe", reasonKey: "maintenance", fromDate: "2033-03-02", toDate: "2033-03-02" } });

        // Preserved exactly: no cancel, no reschedule, no status change.
        expect(await ok(db.from("tour_bookings").select("*").eq("id", booking.id).single())).toEqual(before);
        // Calendar authoring sent nothing.
        expect(((await ok(db.from("communication_messages").select("id").eq("org_id", orgId))) as unknown[]).length).toBe(messagesBefore);
        // Visible to operators.
        const affected = await listCalendarAffectedTourBookings(db, { orgId, siteIds: [siteA], fromUtc: WEEK.from, toUtc: WEEK.to });
        expect(affected.map((a) => [a.bookingId, a.reason, a.entryNames])).toEqual([[booking.id, "closed", ["Burst pipe"]]]);
        expect(await offered(siteA, "2033-03-02")).toEqual([]);

        // Reopen: the slots return, except the one the booking still holds (capacity one).
        await act("withdraw", { entryId: closure });
        expect(await offered(siteA, "2033-03-02")).toEqual(["09:00", "09:30", "11:00"]);
        expect(await listCalendarAffectedTourBookings(db, { orgId, siteIds: [siteA], fromUtc: WEEK.from, toUtc: WEEK.to })).toEqual([]);
        // (10:00 and 10:30 stay hidden: the earlier partial closure is its own lineage and still applies.)
    });

    it("rescheduling out of a closed slot keeps the booking's identity and lands only on an open, free slot", async () => {
        const fam = await family(3);
        const booking = await book(fam, "2033-03-02", "09:00");
        await act("create", { draft: { name: "Closed again", fromDate: "2033-03-02", toDate: "2033-03-02" } });
        // Into another closed time: refused.
        await expect(
            rescheduleTourBooking(db, orgId, booking.id, { startAt: at("2033-03-01", "10:00"), endAt: at("2033-03-01", "10:30"), timezone: TZ, deferLifecycleComms: true }),
        ).rejects.toThrow(/not available/);
        // Into an open time at the other day: allowed, same row.
        const moved = await rescheduleTourBooking(db, orgId, booking.id, { startAt: at("2033-03-03", "09:30"), endAt: at("2033-03-03", "10:00"), timezone: TZ, deferLifecycleComms: true });
        expect(moved.id).toBe(booking.id);
        expect(moved.status_key).toBe("confirmed");
        // Onto the time it now holds, another family cannot book (S1 capacity, unchanged).
        await expect(book(await family(4), "2033-03-03", "09:30")).rejects.toThrow(/not available/);
    });

    it("capacity one still holds under concurrency on an open slot", async () => {
        const fams = await Promise.all([5, 6, 7].map((n) => family(n)));
        const results = await Promise.allSettled(fams.map((f) => book(f, "2033-03-03", "09:00")));
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        for (const r of results.filter((r): r is PromiseRejectedResult => r.status === "rejected")) {
            expect(isTourSlotCapacityConflict(r.reason) || /not available/.test(String(r.reason))).toBe(true);
        }
    });
});
