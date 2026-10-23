/**
 * V7 S1 — `attendance.move` reads the CANONICAL whereabouts, live.
 *
 * Every case runs the real registered attendance actions (check-in, check-out, absence, move,
 * correction) against the real attendance service and database. A move is allowed only for a child
 * the canonical fold says is PRESENT, its source room is the fold's room, and the day board
 * (`resolveCurrentWhereabouts`) and the Attendance card (`buildChildAttendanceReadModel`) read the
 * same answer afterwards. Nothing outside attendance is written.
 *
 * ISOLATION. `child_attendance_events` is append-only (a trigger refuses update/delete), so facts
 * cannot be torn down. The fixture child, agreement, placement and rooms are fixed ids under `P`,
 * created once; every case uses its OWN service date, unique to the run, so runs never share a day.
 * Skipped unless the cert stack is configured.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { getRegisteredAction } from "@/lib/adminV2/actions/actionRegistry";
import { listAttendanceEvents } from "@/lib/childcareOperational/attendance/attendanceService";
import { buildChildAttendanceReadModel } from "@/lib/childcareOperational/attendance/childAttendanceReadModel";
import { resolveCurrentWhereabouts } from "@/lib/roster/resolveCurrentWhereabouts";

function certEnv(): { url: string; serviceKey: string } | null {
    try {
        const file = readFileSync(resolve(__dirname, "../../../../.env.certification.local"), "utf8");
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
// The actions build their own service client: the suite must publish the cert stack it runs against.
if (env) {
    process.env.SUPABASE_URL ||= env.url;
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= env.url;
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= env.serviceKey;
}

const ORG = "00000000-0000-4000-8000-000000000001";
const ADMIN = "00000000-0000-4000-8000-000000000002";
const RIVERSIDE = "00000000-0000-4000-8000-000000000010";
const LAKESIDE = "00000000-0000-4000-8000-000000000011";
const P = "ee7a0700-0000-4000-8000-";
const MEMBER = `${P}0000000000e0`;
const AGREEMENT = `${P}0000000000e1`;
const PLACEMENT = `${P}0000000000e2`;
const R1 = `${P}0000000000c1`;
const R2 = `${P}0000000000c2`;
const FAR = `${P}0000000000c3`; // a classroom of ANOTHER site
const ALL = { departmentScope: "all", allowedDepartmentIds: [], siteScope: "all", allowedSiteLocationIds: [] } as unknown as AdminAccessScopeDimensions;

// A service-date block unique to this run (2031–2036), so append-only facts never meet a prior run's.
// A random 40-day block per run (2031–2250): every case of a run gets its own day, and two runs only
// meet if they draw the same block (1 in 2000).
const RUN_BASE = Date.parse("2031-01-01T00:00:00Z") + Math.floor(Math.random() * 2000) * 40 * 86_400_000;
let dayIndex = 0;
const nextDay = () => new Date(RUN_BASE + dayIndex++ * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!env)("V7 S1 attendance.move on canonical whereabouts, live", () => {
    const db = (env ? createClient(env.url, env.serviceKey, { auth: { persistSession: false } }) : null) as SupabaseClient;
    const ok = (r: { error: { message: string } | null }) => expect(r.error, r.error?.message).toBeNull();

    const act = async (actionKey: string, payload: Record<string, unknown>) => {
        const action = getRegisteredAction(actionKey)!;
        const full = { child_id: MEMBER, time_zone: "UTC", ...payload };
        return action.execute({
            supabase: db,
            ctx: { orgId: ORG, userId: ADMIN, accessScope: ALL },
            invocation: { actionKey, entityType: "child", entityId: MEMBER, payload: full },
            payload: full,
        } as never) as Promise<{ ok: boolean; status?: number; error?: string; result?: { affectedId?: string } }>;
    };
    const at = (day: string, hhmm: string) => `${day}T${hhmm}:00.000Z`;
    const day = async (serviceDate: string) =>
        listAttendanceEvents(db, ORG, { enrollmentAgreementId: AGREEMENT, serviceDateStart: serviceDate, serviceDateEnd: serviceDate });
    const transfers = async (serviceDate: string) =>
        (await day(serviceDate)).filter((e) => e.event_kind === "room_transfer" && e.entry_type === "original").map((e) => [e.from_room_location_id, e.to_room_location_id]);

    beforeAll(async () => {
        const { data: customers } = await db.from("customers").select("id").eq("org_id", ORG).limit(1);
        const customerId = (customers![0] as { id: string }).id;
        const unit = (id: string, label: string, site: string) => ({
            id, org_id: ORG, location_type: "unit", unit_role: "operational_group", parent_location_id: site, label, is_active: true, metadata: {},
        });
        ok(await db.from("locations").upsert([unit(R1, "S1 Room One", RIVERSIDE), unit(R2, "S1 Room Two", RIVERSIDE), unit(FAR, "S1 Far Room", LAKESIDE)], { onConflict: "id", ignoreDuplicates: true }));
        ok(await db.from("customer_members").upsert({ id: MEMBER, org_id: ORG, customer_id: customerId, display_name: "S1 move fixture" }, { onConflict: "id", ignoreDuplicates: true }));
        ok(await db.from("child_enrollment_agreements").upsert({ id: AGREEMENT, org_id: ORG, customer_member_id: MEMBER, customer_id: customerId, site_location_id: RIVERSIDE, status: "active", start_date: "2026-09-01" }, { onConflict: "id", ignoreDuplicates: true }));
        ok(await db.from("child_placements").upsert({ id: PLACEMENT, org_id: ORG, customer_member_id: MEMBER, enrollment_agreement_id: AGREEMENT, site_location_id: RIVERSIDE, room_location_id: R1, start_date: "2026-09-01", status: "active" }, { onConflict: "id", ignoreDuplicates: true }));
    }, 60_000);

    it("1. checked in, then moved: allowed; the source is the fold's room", async () => {
        const d = nextDay();
        expect((await act("attendance.check_in", { event_at: at(d, "08:00"), room_location_id: R1 })).ok).toBe(true);
        const moved = await act("attendance.move", { event_at: at(d, "10:00"), to_room_location_id: R2 });
        expect(moved.ok, moved.error).toBe(true);
        expect(await transfers(d)).toEqual([[R1, R2]]);
    });

    it("2. checked out, then a move: refused, nothing recorded", async () => {
        const d = nextDay();
        await act("attendance.check_in", { event_at: at(d, "08:00"), room_location_id: R1 });
        await act("attendance.check_out", { event_at: at(d, "12:00") });
        const before = (await day(d)).length;
        const r = await act("attendance.move", { event_at: at(d, "13:00"), to_room_location_id: R2 });
        expect(r.ok).toBe(false);
        expect(r.status).toBe(409);
        expect(r.error).toMatch(/checked out/);
        expect((await day(d)).length).toBe(before);
    });

    it("3. marked absent, then a move: refused", async () => {
        const d = nextDay();
        const absent = await act("attendance.mark_absent", { event_at: at(d, "07:00"), reason_key: "illness" });
        expect(absent.ok, absent.error).toBe(true);
        const r = await act("attendance.move", { event_at: at(d, "09:00"), to_room_location_id: R2 });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/absent/);
        expect(await transfers(d)).toEqual([]);
    });

    it("4. not yet arrived (the placement room is not where the child is): refused", async () => {
        const d = nextDay();
        const r = await act("attendance.move", { event_at: at(d, "09:00"), to_room_location_id: R2 });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/not been checked in/);
        expect(await day(d)).toEqual([]);
    });

    it("5. several moves in one day chain from where the child actually is; day board and Attendance card agree", async () => {
        const d = nextDay();
        await act("attendance.check_in", { event_at: at(d, "08:00"), room_location_id: R1 });
        await act("attendance.move", { event_at: at(d, "09:00"), to_room_location_id: R2 });
        await act("attendance.move", { event_at: at(d, "10:00"), to_room_location_id: R1 });
        await act("attendance.move", { event_at: at(d, "11:00"), to_room_location_id: R2 });
        expect(await transfers(d)).toEqual([[R1, R2], [R2, R1], [R1, R2]]);
        const events = await day(d);
        const board = resolveCurrentWhereabouts(events, `${d}T23:59:59.999Z`);
        const card = buildChildAttendanceReadModel({ events, expectedAttendance: [], asOfDate: d }).currentPresenceState;
        expect(board).toEqual({ state: "present", locationId: R2 });
        expect([card.state, card.roomLocationId]).toEqual(["present", R2]);
    });

    it("6. after a reversed move the child is back in the original room, and the next move starts there", async () => {
        const d = nextDay();
        await act("attendance.check_in", { event_at: at(d, "08:00"), room_location_id: R1 });
        const moved = await act("attendance.move", { event_at: at(d, "09:00"), to_room_location_id: R2 });
        const movedId = moved.result?.affectedId ?? (await day(d)).find((e) => e.event_kind === "room_transfer")!.id;
        const reversed = await act("attendance.correct", {
            corrects_event_id: movedId, entry_type: "reversal", event_kind: "room_transfer", event_at: at(d, "09:00"), service_date: d,
            from_room_location_id: R1, to_room_location_id: R2, reason_key: "entered_in_error",
        });
        expect(reversed.ok, reversed.error).toBe(true);
        const again = await act("attendance.move", { event_at: at(d, "10:00"), to_room_location_id: R2 });
        expect(again.ok, again.error).toBe(true);
        expect((await transfers(d)).at(-1)).toEqual([R1, R2]);
    });

    it("7. a room of another site is refused, and nothing is recorded", async () => {
        const d = nextDay();
        await act("attendance.check_in", { event_at: at(d, "08:00"), room_location_id: R1 });
        const r = await act("attendance.move", { event_at: at(d, "09:00"), to_room_location_id: FAR });
        expect(r.ok).toBe(false);
        expect(await transfers(d)).toEqual([]);
    });

    it("8. a double-submitted move with the same key records ONE transfer", async () => {
        const d = nextDay();
        await act("attendance.check_in", { event_at: at(d, "08:00"), room_location_id: R1 });
        const key = `s1-dup-${d}`;
        const first = await act("attendance.move", { event_at: at(d, "09:00"), to_room_location_id: R2, idempotency_key: key });
        const second = await act("attendance.move", { event_at: at(d, "09:00"), to_room_location_id: R2, idempotency_key: key });
        expect(first.ok, first.error).toBe(true);
        expect(await transfers(d)).toEqual([[R1, R2]]);
        expect(second.ok, second.error).toBe(true);
        expect(second.result?.affectedId).toBe(first.result?.affectedId);
    });

    it("10. attendance writes nothing outside attendance: assignments, placements and the agreement are unchanged", async () => {
        const snap = async () =>
            JSON.stringify(await Promise.all([
                db.from("schedule_assignments").select("id, status, room_location_id, updated_at").eq("customer_member_id", MEMBER).order("id"),
                db.from("child_placements").select("id, status, room_location_id, updated_at").eq("customer_member_id", MEMBER).order("id"),
                db.from("child_enrollment_agreements").select("id, status, updated_at").eq("id", AGREEMENT),
            ]).then((r) => r.map((x) => x.data)));
        const before = await snap();
        const d = nextDay();
        await act("attendance.check_in", { event_at: at(d, "08:00"), room_location_id: R1 });
        await act("attendance.move", { event_at: at(d, "09:00"), to_room_location_id: R2 });
        await act("attendance.check_out", { event_at: at(d, "17:00") });
        expect(await snap()).toBe(before);
    });
});
