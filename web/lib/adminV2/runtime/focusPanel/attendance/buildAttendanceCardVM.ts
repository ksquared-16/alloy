import "server-only";

/**
 * THE ATTENDANCE CARD'S COMPOSITION — one server-side pass, from the canonical owners.
 *
 * The card asks four things: what was expected, what happened, where is the child now, and what can
 * I do. All four are already decided somewhere canonical, so this composes rather than computes:
 *
 *   expected window     `fetchScheduleExpectations`      (schedule pattern → expected day)
 *   events              `listAttendanceEvents`           (the append-only record)
 *   state + timelines   `buildChildAttendanceReadModel`  (fold: presence, movements, corrections)
 *   subject             `resolveAttendanceSubject`       (child → agreement, fails closed)
 *
 * ── ONE PASS, NOT FIVE ──
 *
 * Schedule, presence, movements, history and corrections are fetched together and folded once. A
 * card that asked for each separately would show its own state assembling itself on screen, and
 * every participant switch would pay for it again.
 *
 * ── THE PROVIDER NEVER DROPS AN EVENT ──
 *
 * `movements` is the COMPLETE ordered list. Bounding is presentation: the card decides how many
 * markers to draw and reports the remainder as a count. Truncating here would make the underlying
 * record unrecoverable from the VM, and "+3 movements" would become a claim nobody could check.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildChildAttendanceReadModel } from "@/lib/childcareOperational/attendance/childAttendanceReadModel";
import { listAttendanceEvents } from "@/lib/childcareOperational/attendance/attendanceService";
import { resolveAttendanceSubject } from "@/lib/childcareOperational/attendance/resolveAttendanceSubject";
import { fetchScheduleExpectations } from "@/lib/childcareOperational/expectations/fetchScheduleExpectations";

export type AttendanceMovementVM = {
    eventId: string;
    at: string;
    fromRoomLocationId: string | null;
    toRoomLocationId: string | null;
    fromRoomLabel: string | null;
    toRoomLabel: string | null;
};

export type AttendanceDayVM = {
    date: string;
    firstCheckInAt: string | null;
    lastCheckOutAt: string | null;
    present: boolean;
    absent: boolean;
    missingCheckout: boolean;
};

export type AttendanceCardVM = {
    participant: { customerMemberId: string; displayName: string | null } | null;
    date: string;
    /** Whether the schedule expects this child today, and where. */
    expected: { expected: boolean; roomLocationId: string | null; roomLabel: string | null };
    /** The fold's answer, never the card's. */
    state: "present" | "checked_out" | "absent" | "not_arrived" | "no_record";
    checkInAt: string | null;
    checkOutAt: string | null;
    currentRoomLocationId: string | null;
    currentRoomLabel: string | null;
    /** COMPLETE and ordered. Bounding belongs to the card. */
    movements: AttendanceMovementVM[];
    recentDays: AttendanceDayVM[];
    /** True when today's record carries a correction or reversal. */
    corrected: boolean;
    /** Absent when the child has no attendable enrolment — the card then renders no controls. */
    unavailableReason: string | null;
};

function ymd(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function shiftDays(date: string, delta: number): string {
    const d = new Date(`${date}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return ymd(d);
}

export async function buildAttendanceCardVM(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        customerMemberId: string;
        displayName?: string | null;
        /** Operating day; defaults to today. */
        date?: string | null;
        /** How many days of history the compact strip shows. */
        recentDays?: number;
    },
): Promise<AttendanceCardVM> {
    const date = args.date?.trim() || ymd(new Date());
    const historyDays = Math.max(1, args.recentDays ?? 5);
    const windowStart = shiftDays(date, -(historyDays - 1));

    const base: AttendanceCardVM = {
        participant: { customerMemberId: args.customerMemberId, displayName: args.displayName ?? null },
        date,
        expected: { expected: false, roomLocationId: null, roomLabel: null },
        state: "no_record",
        checkInAt: null,
        checkOutAt: null,
        currentRoomLocationId: null,
        currentRoomLabel: null,
        movements: [],
        recentDays: [],
        corrected: false,
        unavailableReason: null,
    };

    // FAIL CLOSED. Without an attendable enrolment there is no attendance to show and no command to
    // offer — the card says so rather than rendering an empty day that looks like "nobody arrived".
    const subject = await resolveAttendanceSubject(supabase, args.orgId, args.customerMemberId);
    if (!subject.ok) return { ...base, unavailableReason: subject.message };

    const [events, expectations] = await Promise.all([
        listAttendanceEvents(supabase, args.orgId, {
            enrollmentAgreementId: subject.subject.enrollmentAgreementId,
            serviceDateStart: windowStart,
            serviceDateEnd: date,
        }).catch(() => []),
        subject.subject.siteLocationId
            ? fetchScheduleExpectations(supabase, {
                  orgId: args.orgId,
                  siteLocationId: subject.subject.siteLocationId,
                  dateStart: date,
                  dateEnd: date,
              }).catch(() => null)
            : Promise.resolve(null),
    ]);

    const expectedToday = (expectations?.expectedAttendance ?? []).find(
        (e) => e.customerMemberId === args.customerMemberId && e.date === date,
    );

    const read = buildChildAttendanceReadModel({
        events: events as never,
        expectedAttendance: expectedToday ? [expectedToday] : [],
        asOfDate: date,
    });

    const roomLabels = await roomLabelsFor(supabase, args.orgId, [
        expectedToday?.roomLocationId ?? null,
        read.currentPresenceState.roomLocationId,
        ...read.roomMovementTimeline.flatMap((m) => [m.fromRoomLocationId, m.toRoomLocationId]),
    ]);

    const today = read.actualPresenceSummary.find((d) => d.serviceDate === date) ?? null;
    const movements = read.roomMovementTimeline
        .filter((m) => m.serviceDate === date)
        .map((m) => ({
            eventId: m.eventId,
            at: m.at,
            fromRoomLocationId: m.fromRoomLocationId,
            toRoomLocationId: m.toRoomLocationId,
            fromRoomLabel: m.fromRoomLocationId ? roomLabels.get(m.fromRoomLocationId) ?? null : null,
            toRoomLabel: m.toRoomLocationId ? roomLabels.get(m.toRoomLocationId) ?? null : null,
        }));

    /*
     * `not_arrived` is a CARD state, not a fold state: the fold says `no_record`, which is also what
     * a child nobody expects looks like. Separating them is the difference between "due and not here
     * yet" and "nothing to say".
     */
    const foldState = read.currentPresenceState.state;
    const state: AttendanceCardVM["state"] =
        foldState === "no_record" && expectedToday ? "not_arrived" : foldState;

    return {
        ...base,
        expected: {
            expected: Boolean(expectedToday),
            roomLocationId: expectedToday?.roomLocationId ?? null,
            roomLabel: expectedToday?.roomLocationId
                ? roomLabels.get(expectedToday.roomLocationId) ?? null
                : null,
        },
        state,
        checkInAt: today?.firstCheckInAt ?? null,
        checkOutAt: today?.lastCheckOutAt ?? null,
        currentRoomLocationId: read.currentPresenceState.roomLocationId,
        currentRoomLabel: read.currentPresenceState.roomLocationId
            ? roomLabels.get(read.currentPresenceState.roomLocationId) ?? null
            : null,
        movements,
        recentDays: read.actualPresenceSummary
            .slice()
            .sort((a, b) => b.serviceDate.localeCompare(a.serviceDate))
            .slice(0, historyDays)
            .map((d) => ({
                date: d.serviceDate,
                firstCheckInAt: d.firstCheckInAt,
                lastCheckOutAt: d.lastCheckOutAt,
                present: d.present,
                absent: d.absent,
                missingCheckout: d.missingCheckout,
            })),
        corrected: read.corrections.some((c) => events.some((e) => e.id === c.correctsEventId)),
    };
}

/** Operator-facing room names. Ids are identity; a card shows the name. */
async function roomLabelsFor(
    supabase: SupabaseClient,
    orgId: string,
    ids: readonly (string | null)[],
): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) return new Map();
    // `label` is the operator-facing name on `locations`; there is no `name` column, and selecting
    // one returns rows whose label is silently undefined — every room then renders blank.
    const { data } = await supabase
        .from("locations")
        .select("id, label")
        .eq("org_id", orgId)
        .in("id", unique);
    return new Map(
        (data ?? [])
            .map((r) => [r.id as string, String(r.label ?? "").trim()] as const)
            .filter(([, label]) => label.length > 0),
    );
}
