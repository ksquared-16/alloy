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

import {
    buildChildAttendanceReadModel,
    type ChildAttendanceReadModel,
} from "@/lib/childcareOperational/attendance/childAttendanceReadModel";
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

/** One event on a day's sequence — the append-only record, projected, never flattened. */
export type AttendanceHistoryEventVM = {
    eventId: string;
    at: string;
    kind: "check_in" | "check_out" | "movement" | "absence";
    roomLabel: string | null;
    fromRoomLabel: string | null;
    /**
     * This event has been corrected or reversed by a LATER event.
     *
     * Attendance is append-only: a correction does not edit the original, it supersedes it. The
     * history shows both and marks the superseded one, because an operator checking whether a day
     * was recorded correctly needs to see that a correction happened — hiding it would be the
     * second history store this card must never become.
     */
    corrected: boolean;
    entryType: string;
};

/** A day of the child's attendance record. Grouped, not aggregated into a new store. */
export type AttendanceHistoryDayVM = {
    date: string;
    expectedRoomLabel: string | null;
    checkInAt: string | null;
    checkOutAt: string | null;
    /** Null when the day has no checkout — an open day has no duration, and 0 would be a lie. */
    attendedMinutes: number | null;
    present: boolean;
    absent: boolean;
    missingCheckout: boolean;
    corrected: boolean;
    events: AttendanceHistoryEventVM[];
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
    /**
     * The child's attendance record over the requested window — the Details experience.
     *
     * Projected from the SAME canonical fold the summary uses (`checkInOutTimeline`,
     * `roomMovementTimeline`, `absences`, `corrections`, `actualPresenceSummary`). There is no
     * second attendance model and no new ledger: this groups what the fold already returned.
     */
    history: AttendanceHistoryDayVM[];
    /** True when today's record carries a correction or reversal. */
    corrected: boolean;
    /**
     * The rooms a transfer can target — the child's OWN site, never the org.
     *
     * `attendance.move` is the one command that cannot be issued without a destination, and the
     * adapter refuses without `to_room_location_id`. Offering the org's rooms would let an operator
     * move a child to another campus in one click, so the list is scoped to the site their placement
     * already names.
     */
    siteRooms: Array<{ id: string; label: string }>;
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


/**
 * THE CHILD'S ATTENDANCE RECORD OVER TIME — grouped, never re-derived.
 *
 * Everything here comes from the fold the summary already computed. Days are the grouping because
 * that is how an operator reads attendance ("was Tuesday recorded right?"), and each day carries its
 * own event sequence so the question "what actually happened" is one expand away rather than a
 * separate screen.
 *
 * Corrections are PRESENT, not applied. `corrections` names the event each correction supersedes,
 * so the superseded event is marked and both remain visible. Flattening them would produce a tidier
 * history that no longer matches the append-only record it claims to show.
 */
function buildAttendanceHistory(
    read: ChildAttendanceReadModel,
    roomLabels: Map<string, string>,
    expectedRoomLabelByDate: Map<string, string | null>,
): AttendanceHistoryDayVM[] {
    const label = (id: string | null): string | null => (id ? roomLabels.get(id) ?? null : null);
    const correctedEventIds = new Set(read.corrections.map((c) => c.correctsEventId));

    const byDate = new Map<string, AttendanceHistoryEventVM[]>();
    const push = (date: string, e: AttendanceHistoryEventVM) => {
        const list = byDate.get(date);
        if (list) list.push(e);
        else byDate.set(date, [e]);
    };

    for (const t of read.checkInOutTimeline) {
        push(t.serviceDate, {
            eventId: t.eventId,
            at: t.at,
            kind: t.kind,
            roomLabel: label(t.roomLocationId),
            fromRoomLabel: null,
            corrected: correctedEventIds.has(t.eventId),
            entryType: t.entryType,
        });
    }
    for (const m of read.roomMovementTimeline) {
        push(m.serviceDate, {
            eventId: m.eventId,
            at: m.at,
            kind: "movement",
            roomLabel: label(m.toRoomLocationId),
            fromRoomLabel: label(m.fromRoomLocationId),
            corrected: correctedEventIds.has(m.eventId),
            entryType: "movement",
        });
    }
    for (const a of read.absences) {
        push(a.serviceDate, {
            eventId: a.eventId,
            at: a.at,
            kind: "absence",
            roomLabel: null,
            fromRoomLabel: null,
            corrected: correctedEventIds.has(a.eventId),
            entryType: a.classification ?? "absence",
        });
    }

    const summaryByDate = new Map(read.actualPresenceSummary.map((d) => [d.serviceDate, d]));
    const dates = [...new Set([...byDate.keys(), ...summaryByDate.keys()])].sort((a, b) =>
        b.localeCompare(a),
    );

    return dates.map((date) => {
        const events = (byDate.get(date) ?? []).sort((a, b) => a.at.localeCompare(b.at));
        const day = summaryByDate.get(date);
        const inAt = day?.firstCheckInAt ?? null;
        const outAt = day?.lastCheckOutAt ?? null;
        // No checkout means no duration. Zero would read as "attended nothing", which is a
        // different and wronger claim than "the day is still open".
        const attendedMinutes =
            inAt && outAt ?
                Math.max(0, Math.round((new Date(outAt).getTime() - new Date(inAt).getTime()) / 60000))
            :   null;
        return {
            date,
            expectedRoomLabel: expectedRoomLabelByDate.get(date) ?? null,
            checkInAt: inAt,
            checkOutAt: outAt,
            attendedMinutes,
            present: Boolean(day?.present),
            absent: Boolean(day?.absent),
            missingCheckout: Boolean(day?.missingCheckout),
            corrected: events.some((e) => e.corrected) || events.some((e) => e.entryType === "correction"),
            events,
        };
    });
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
        siteRooms: [],
        state: "no_record",
        checkInAt: null,
        checkOutAt: null,
        currentRoomLocationId: null,
        currentRoomLabel: null,
        movements: [],
        recentDays: [],
        history: [],
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

    // The transfer destinations, from the child's own site. One query, alongside the label read.
    const siteRooms = subject.subject.siteLocationId
        ? await siteRoomsFor(supabase, args.orgId, subject.subject.siteLocationId)
        : [];

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
        siteRooms,
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
        history: buildAttendanceHistory(
            read,
            roomLabels,
            // Expected room per day, from the same expectation set the summary reads.
            new Map(
                (expectations?.expectedAttendance ?? [])
                    .filter((e) => e.customerMemberId === args.customerMemberId)
                    .map((e) => [e.date, e.roomLocationId ? roomLabels.get(e.roomLocationId) ?? null : null]),
            ),
        ),
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

/**
 * The rooms at ONE site, for transfer destinations.
 *
 * Scoped to the site rather than the org for the same reason the check-in room comes from the
 * placement: a destination list that spans campuses turns a mis-click into a child recorded at a
 * building they are not in. `label` is the operator-facing column on `locations`; there is no
 * `name`, and selecting one returns rows whose label is silently undefined.
 */
async function siteRoomsFor(
    supabase: SupabaseClient,
    orgId: string,
    siteLocationId: string,
): Promise<Array<{ id: string; label: string }>> {
    const { data } = await supabase
        .from("locations")
        .select("id, label")
        .eq("org_id", orgId)
        .eq("location_type", "unit")
        .eq("parent_location_id", siteLocationId)
        .order("label", { ascending: true });
    return ((data ?? []) as Array<{ id: string; label: unknown }>)
        .map((r) => ({ id: r.id, label: String(r.label ?? "").trim() }))
        .filter((r) => r.label.length > 0);
}
