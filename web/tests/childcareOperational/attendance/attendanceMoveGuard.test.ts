/**
 * V7 S1 — `attendance.move` is judged by the CANONICAL whereabouts (the fold the day board and the
 * Attendance card read), never by the last room an event happened to name or by the placement.
 *
 * CI-runnable twin of `live/attendanceMoveWhereabouts.live.test.ts`: the real action and the real
 * fold, with only the database reads and the permission check stubbed. Each case records what the
 * move would write (or that it refused).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
let dayRows: Row[] = [];
const recorded: Row[] = [];

vi.mock("@/lib/childcareOperational/attendance/resolveAttendanceSubject", () => ({
    resolveAttendanceSubject: async () => ({
        ok: true,
        subject: { customerMemberId: "m", enrollmentAgreementId: "ag", siteLocationId: "site", placementRoomLocationId: "T2" },
    }),
}));
vi.mock("@/lib/childcareOperational/attendance/attendancePermissions", async (orig) => ({
    ...(await orig<Record<string, unknown>>()),
    assertAttendanceCaptureAllowed: async () => ({ ok: true }),
}));
vi.mock("@/lib/childcareOperational/attendance/attendanceService", async (orig) => ({
    ...(await orig<Record<string, unknown>>()),
    listAttendanceEvents: async () => dayRows,
    recordAttendanceEvent: async (_db: unknown, input: Row) => {
        recorded.push(input);
        return { id: `new-${recorded.length}` };
    },
}));

import { getRegisteredAction } from "@/lib/adminV2/actions/actionRegistry";

let n = 0;
const ev = (kind: string, hhmm: string, rooms: { room?: string; from?: string; to?: string } = {}, extra: Row = {}): Row => ({
    id: `e${String(++n).padStart(3, "0")}`, org_id: "o", event_kind: kind, entry_type: "original", corrects_event_id: null,
    event_at: `2026-11-10T${hhmm}:00.000Z`, service_date: "2026-11-10", enrollment_agreement_id: "ag", customer_member_id: "m",
    room_location_id: rooms.room ?? null, from_room_location_id: rooms.from ?? null, to_room_location_id: rooms.to ?? null, ...extra,
});
const move = async (toRoom: string, payload: Row = {}) => {
    const action = getRegisteredAction("attendance.move")!;
    const full = { child_id: "m", to_room_location_id: toRoom, event_at: "2026-11-10T13:00:00.000Z", time_zone: "UTC", ...payload };
    return action.execute({
        supabase: {} as never,
        ctx: { orgId: "o", userId: "u", accessScope: { departmentScope: "all", allowedDepartmentIds: [], siteScope: "all", allowedSiteLocationIds: [] } },
        invocation: { actionKey: "attendance.move", entityType: "child", entityId: "m", payload: full },
        payload: full,
    } as never) as Promise<{ ok: boolean; status?: number; error?: string; result?: { affectedId?: string | null } }>;
};

beforeEach(() => {
    dayRows = [];
    recorded.length = 0;
});

describe("attendance.move — present children only, from where they are", () => {
    it("checked in, then moved: the source is the fold's room", async () => {
        dayRows = [ev("check_in", "08:00", { room: "T2" })];
        expect((await move("GYM")).ok).toBe(true);
        expect([recorded[0].fromRoomLocationId, recorded[0].toRoomLocationId]).toEqual(["T2", "GYM"]);
    });
    it("checked out (kiosk: no room on the check-out): refused, nothing written", async () => {
        dayRows = [ev("check_in", "08:00", { room: "T2" }), ev("check_out", "12:00")];
        const r = await move("GYM");
        expect([r.ok, r.status]).toEqual([false, 409]);
        expect(r.error).toMatch(/checked out/);
        expect(recorded).toEqual([]);
    });
    it("checked out (admin: the check-out names the placement room): still refused", async () => {
        dayRows = [ev("check_in", "08:00", { room: "T2" }), ev("check_out", "12:00", { room: "T2" })];
        expect((await move("GYM")).ok).toBe(false);
    });
    it("moved to the gym, then checked out: refused — the gym is not where the child is", async () => {
        dayRows = [ev("check_in", "08:00", { room: "T2" }), ev("room_transfer", "10:00", { from: "T2", to: "GYM" }), ev("check_out", "12:00")];
        expect((await move("T2")).ok).toBe(false);
    });
    it("absent (the absence names the placement room): refused", async () => {
        dayRows = [ev("absence", "07:00", { room: "T2" })];
        const r = await move("GYM");
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/absent/);
    });
    it("no facts today: refused — the placement room is where they are meant to be, not where they are", async () => {
        const r = await move("GYM");
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/not been checked in/);
    });
    it("a fact after the move instant does not decide it", async () => {
        dayRows = [ev("check_in", "08:00", { room: "T2" }), ev("check_out", "17:00")];
        expect((await move("GYM", { event_at: "2026-11-10T13:00:00.000Z" })).ok).toBe(true);
        expect(recorded[0].fromRoomLocationId).toBe("T2");
    });
    it("repeated moves chain from the latest room", async () => {
        dayRows = [ev("check_in", "08:00", { room: "T2" }), ev("room_transfer", "09:00", { from: "T2", to: "GYM" }), ev("room_transfer", "10:00", { from: "GYM", to: "T2" })];
        await move("GYM");
        expect(recorded[0].fromRoomLocationId).toBe("T2");
    });
    it("a reversed move is undone before the next one is judged", async () => {
        const moved = ev("room_transfer", "09:00", { from: "T2", to: "GYM" });
        dayRows = [ev("check_in", "08:00", { room: "T2" }), moved, ev("room_transfer", "09:05", { from: "T2", to: "GYM" }, { entry_type: "reversal", corrects_event_id: moved.id })];
        await move("GYM");
        expect(recorded[0].fromRoomLocationId).toBe("T2");
    });
    it("a retried move with the same key converges on the recorded fact instead of describing a new one", async () => {
        dayRows = [ev("check_in", "08:00", { room: "T2" }), ev("room_transfer", "13:00", { from: "T2", to: "GYM" }, { idempotency_key: "k1" })];
        const r = await move("GYM", { idempotency_key: "k1" });
        expect(r.ok).toBe(true);
        expect(r.result?.affectedId).toBe(dayRows[1].id);
        expect(recorded).toEqual([]);
    });
    it("the service day is the one the fact is recorded on (local time zone), not the UTC date", async () => {
        // 01:30 UTC on the 11th is the evening of the 10th in Los Angeles: the move is judged on the 10th.
        dayRows = [ev("check_in", "08:00", { room: "T2" })];
        const r = await move("GYM", { event_at: "2026-11-11T01:30:00.000Z", time_zone: "America/Los_Angeles" });
        expect(r.ok).toBe(true);
    });
});
