import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
    TOUR_COMMS_SCHEDULED_SEND_METADATA,
    TOUR_SCHEDULING_SCHEDULED_SEND_SOURCE,
    DEFAULT_TOUR_COMMS_CONFIG,
    type TourCommsConfig,
} from "@/lib/tours/comms/tourCommsConfig";
import {
    buildTourSchedulingReminderMetadata,
    cancelPendingTourSchedulingRemindersForBooking,
    insertTourSchedulingReminderSend,
    listPendingTourSchedulingRemindersForBooking,
    replaceTourSchedulingRemindersForBooking,
    scheduleTourSchedulingRemindersForBooking,
    TOUR_REMINDER_EVENT_KEY,
} from "@/lib/tours/comms/tourSchedulingScheduledSends";

type StoredRow = Record<string, unknown>;

function cloneRows(rows: StoredRow[]): StoredRow[] {
    return rows.map((r) => ({ ...r, metadata: { ...(r.metadata as Record<string, unknown>) } }));
}

function createScheduledSendsMock(initial: StoredRow[] = []) {
    const rows = cloneRows(initial);
    let lastInserted: StoredRow | null = null;

    type Filter = { op: "eq" | "in"; col: string; val: unknown };

    function applyFilters(source: StoredRow[], filters: Filter[]): StoredRow[] {
        return source.filter((row) =>
            filters.every((f) => {
                if (f.op === "eq") {
                    if (f.col.startsWith("metadata->>")) {
                        const key = f.col.replace("metadata->>", "");
                        const meta = (row.metadata ?? {}) as Record<string, unknown>;
                        return String(meta[key] ?? "") === String(f.val);
                    }
                    return String(row[f.col]) === String(f.val);
                }
                if (f.op === "in") {
                    const vals = (f.val as unknown[]).map(String);
                    return vals.includes(String(row[f.col]));
                }
                return true;
            })
        );
    }

    function buildChain(table: string, op: "select" | "insert" | "update", patch?: Record<string, unknown>) {
        const filters: Filter[] = [];
        let orderCol: string | null = null;
        let orderAsc = true;
        let pendingInsert: Record<string, unknown> | Record<string, unknown>[] | null = null;

        const exec = async () => {
            if (table !== "communication_scheduled_sends") {
                return { data: null, error: { message: `unexpected table ${table}` } };
            }
            if (op === "insert" && pendingInsert) {
                const items = Array.isArray(pendingInsert) ? pendingInsert : [pendingInsert];
                pendingInsert = null;
                for (const item of items) {
                    lastInserted = {
                        id: randomUUID(),
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                        ...item,
                    };
                    rows.push(lastInserted);
                }
            }

            let matched = applyFilters([...rows], filters);
            if (op === "update" && patch) {
                for (const row of matched) {
                    Object.assign(row, patch, { updated_at: new Date().toISOString() });
                }
            }
            if (orderCol) {
                matched = [...matched].sort((a, b) => {
                    const av = String(a[orderCol!]);
                    const bv = String(b[orderCol!]);
                    return orderAsc ? av.localeCompare(bv) : bv.localeCompare(av);
                });
            }
            return { data: matched, error: null };
        };

        const api = {
            select: (_cols?: string) => api,
            insert: (payload: Record<string, unknown> | Record<string, unknown>[]) => {
                pendingInsert = payload;
                op = "insert";
                return api;
            },
            update: (updatePatch: Record<string, unknown>) => buildChain(table, "update", updatePatch),
            eq: (col: string, val: unknown) => {
                filters.push({ op: "eq", col, val });
                return api;
            },
            in: (col: string, val: unknown[]) => {
                filters.push({ op: "in", col, val });
                return api;
            },
            filter: (col: string, _op: string, val: unknown) => {
                filters.push({ op: "eq", col, val });
                return api;
            },
            order: (col: string, opts?: { ascending?: boolean }) => {
                orderCol = col;
                orderAsc = opts?.ascending !== false;
                return api;
            },
            single: async () => {
                if (op === "insert" && pendingInsert) {
                    await exec();
                    if (!lastInserted) {
                        return { data: null, error: { message: "not found" } };
                    }
                    return {
                        data: {
                            ...lastInserted,
                            metadata: { ...(lastInserted.metadata as Record<string, unknown>) },
                        },
                        error: null,
                    };
                }
                const result = await exec();
                const matched = (result.data ?? []) as StoredRow[];
                if (matched.length !== 1) {
                    return { data: null, error: { message: matched.length === 0 ? "not found" : "multiple" } };
                }
                return { data: matched[0], error: null };
            },
            maybeSingle: async () => {
                const result = await exec();
                const matched = (result.data ?? []) as StoredRow[];
                return { data: matched[0] ?? null, error: null };
            },
            then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
                exec().then(resolve, reject),
        };

        return api;
    }

    const supabase = {
        from: (table: string) => ({
            select: (cols?: string) => buildChain(table, "select").select(cols),
            insert: (payload: Record<string, unknown> | Record<string, unknown>[]) =>
                buildChain(table, "insert").insert(payload),
            update: (patch: Record<string, unknown>) => buildChain(table, "update", patch),
        }),
        _rows: rows,
    };

    return supabase as unknown as SupabaseClient & { _rows: StoredRow[] };
}

const ORG = "11111111-1111-4111-8111-111111111111";
const OPP = "22222222-2222-4222-8222-222222222222";
const BOOKING = "33333333-3333-4333-8333-333333333333";
const PERSON = "44444444-4444-4444-8444-444444444444";
const ACTOR = "55555555-5555-4555-8555-555555555555";
const LOCATION = "66666666-6666-4666-8666-666666666666";

const enabledConfig: TourCommsConfig = {
    ...DEFAULT_TOUR_COMMS_CONFIG,
    enabled: true,
    channels: { email: true, sms: true },
    quiet_hours: { ...DEFAULT_TOUR_COMMS_CONFIG.quiet_hours, enabled: false },
    reminder_offsets: [
        { reminder_key: "tour_reminder_24h", offset_minutes: 24 * 60, channels: ["email", "sms"] },
        { reminder_key: "tour_reminder_2h", offset_minutes: 2 * 60, channels: ["email"] },
    ],
};

const bookingRef = {
    id: BOOKING,
    start_at: "2026-06-16T12:00:00.000Z",
    status_key: "confirmed",
    timezone: "UTC",
    location_id: LOCATION,
};

describe("tourSchedulingScheduledSends", () => {
    it("populates dedupe metadata on insert", async () => {
        const supabase = createScheduledSendsMock();
        const r = await insertTourSchedulingReminderSend({
            supabase,
            orgId: ORG,
            opportunityId: OPP,
            recipientPersonId: PERSON,
            actorUserId: ACTOR,
            channel: "email",
            scheduledForIso: "2026-06-15T12:00:00.000Z",
            booking: bookingRef,
            reminderKey: "tour_reminder_24h",
            scheduleGeneration: 1,
            now: new Date("2026-06-14T00:00:00.000Z"),
        });

        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.row.source).toBe(TOUR_SCHEDULING_SCHEDULED_SEND_SOURCE);
        expect(r.row.entity_id).toBe(OPP);
        expect(r.row.metadata).toMatchObject({
            [TOUR_COMMS_SCHEDULED_SEND_METADATA.tourBookingId]: BOOKING,
            [TOUR_COMMS_SCHEDULED_SEND_METADATA.reminderKey]: "tour_reminder_24h",
            [TOUR_COMMS_SCHEDULED_SEND_METADATA.scheduleGeneration]: 1,
            [TOUR_COMMS_SCHEDULED_SEND_METADATA.eventKey]: TOUR_REMINDER_EVENT_KEY,
            [TOUR_COMMS_SCHEDULED_SEND_METADATA.tourStartAt]: bookingRef.start_at,
            [TOUR_COMMS_SCHEDULED_SEND_METADATA.locationId]: LOCATION,
        });
    });

    it("buildTourSchedulingReminderMetadata includes optional reason and quiet-hours flag", () => {
        const meta = buildTourSchedulingReminderMetadata({
            tourBookingId: BOOKING,
            reminderKey: "tour_reminder_2h",
            scheduleGeneration: 2,
            tourStartAtIso: bookingRef.start_at,
            locationId: LOCATION,
            quietHoursAdjusted: true,
            reason: "reschedule",
        });
        expect(meta[TOUR_COMMS_SCHEDULED_SEND_METADATA.quietHoursAdjusted]).toBe(true);
        expect(meta[TOUR_COMMS_SCHEDULED_SEND_METADATA.reason]).toBe("reschedule");
    });

    it("schedules email and SMS separately for the same reminder key", async () => {
        const supabase = createScheduledSendsMock();
        const r = await scheduleTourSchedulingRemindersForBooking({
            supabase,
            orgId: ORG,
            opportunityId: OPP,
            recipientPersonId: PERSON,
            actorUserId: ACTOR,
            booking: bookingRef,
            config: enabledConfig,
            scheduleGeneration: 1,
            now: new Date("2026-06-14T00:00:00.000Z"),
        });

        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.scheduled).toHaveLength(3);
        const channels24h = r.scheduled
            .filter((row) => row.metadata[TOUR_COMMS_SCHEDULED_SEND_METADATA.reminderKey] === "tour_reminder_24h")
            .map((row) => row.channel)
            .sort();
        expect(channels24h).toEqual(["email", "sms"]);
    });

    it("cancel helpers target only tour_scheduling pending/claimed rows", async () => {
        const supabase = createScheduledSendsMock([
            {
                id: "tour-pending",
                org_id: ORG,
                entity_id: OPP,
                source: TOUR_SCHEDULING_SCHEDULED_SEND_SOURCE,
                status: "pending",
                metadata: { tour_booking_id: BOOKING, reminder_key: "tour_reminder_24h" },
            },
            {
                id: "tour-sent",
                org_id: ORG,
                entity_id: OPP,
                source: TOUR_SCHEDULING_SCHEDULED_SEND_SOURCE,
                status: "sent",
                metadata: { tour_booking_id: BOOKING, reminder_key: "tour_reminder_2h" },
            },
            {
                id: "assist-pending",
                org_id: ORG,
                entity_id: OPP,
                source: "task_assist",
                status: "pending",
                metadata: { tour_booking_id: BOOKING },
            },
        ]);

        const canceled = await cancelPendingTourSchedulingRemindersForBooking({
            supabase,
            orgId: ORG,
            tourBookingId: BOOKING,
            opportunityId: OPP,
        });

        expect(canceled.ok).toBe(true);
        if (!canceled.ok) return;
        expect(canceled.canceledCount).toBe(1);
        expect(canceled.canceledIds).toEqual(["tour-pending"]);

        const byId = Object.fromEntries(supabase._rows.map((r) => [String(r.id), String(r.status)]));
        expect(byId["tour-pending"]).toBe("canceled");
        expect(byId["tour-sent"]).toBe("sent");
        expect(byId["assist-pending"]).toBe("pending");
    });

    it("replacement cancels old pending rows and inserts new rows with new generation", async () => {
        const supabase = createScheduledSendsMock([
            {
                id: "old-pending",
                org_id: ORG,
                entity_id: OPP,
                entity_type: "opportunities",
                recipient_person_id: PERSON,
                channel: "email",
                body_snapshot: "old",
                source: TOUR_SCHEDULING_SCHEDULED_SEND_SOURCE,
                status: "pending",
                scheduled_for: "2026-06-15T12:00:00.000Z",
                metadata: {
                    tour_booking_id: BOOKING,
                    reminder_key: "tour_reminder_24h",
                    schedule_generation: 1,
                },
            },
        ]);

        const replaced = await replaceTourSchedulingRemindersForBooking({
            supabase,
            orgId: ORG,
            opportunityId: OPP,
            recipientPersonId: PERSON,
            actorUserId: ACTOR,
            booking: { ...bookingRef, start_at: "2026-06-18T12:00:00.000Z" },
            config: enabledConfig,
            scheduleGeneration: 2,
            now: new Date("2026-06-14T00:00:00.000Z"),
        });

        expect(replaced.ok).toBe(true);
        if (!replaced.ok) return;
        expect(replaced.canceledCount).toBe(1);

        const pending = await listPendingTourSchedulingRemindersForBooking({
            supabase,
            orgId: ORG,
            tourBookingId: BOOKING,
        });
        expect(pending.ok).toBe(true);
        if (!pending.ok) return;
        expect(pending.rows.length).toBeGreaterThan(0);
        expect(pending.rows.every((r) => r.metadata[TOUR_COMMS_SCHEDULED_SEND_METADATA.scheduleGeneration] === 2)).toBe(true);
        expect(supabase._rows.find((r) => r.id === "old-pending")?.status).toBe("canceled");
    });

    it("does not schedule reminders for terminal booking statuses", async () => {
        const supabase = createScheduledSendsMock();
        for (const status_key of ["canceled", "completed", "no_show"] as const) {
            const r = await scheduleTourSchedulingRemindersForBooking({
                supabase,
                orgId: ORG,
                opportunityId: OPP,
                recipientPersonId: PERSON,
                actorUserId: ACTOR,
                booking: { ...bookingRef, status_key },
                config: enabledConfig,
                scheduleGeneration: 1,
                now: new Date("2026-06-10T00:00:00.000Z"),
            });
            expect(r.ok).toBe(true);
            if (!r.ok) return;
            expect(r.scheduled).toHaveLength(0);
        }
    });
});
