/**
 * The read side of the staffing projection.
 *
 * Every authority is asked through the function that already owns it, never
 * re-queried here:
 *
 *   baseline staff   `buildStaffSupply` — the one place that decides whether an
 *                    Assignment is staffing supply at all (participation,
 *                    commitment, effective dating, employment coverage)
 *   hours            `resolveAssignmentTimes` — the one read for when an
 *                    Assignment runs, for staff and children alike
 *   expectations     `loadOperationalExpectationInputs` + the shared room config
 *                    resolvers, so the ratio the projection uses is the ratio the
 *                    roster uses
 *   Coverage         `effectiveCoverageForSite`
 *   Availability     the batch projection, which calls the same pure resolver as
 *                    the single-employment read
 *   observations     the existing Attendance and Presence folds for effectiveness,
 *                    then folded into intervals here
 *
 * That is what keeps this a projection. If it queried `schedule_assignments`
 * itself it would become a second staffing engine with its own idea of who
 * counts, and the two would drift the first time a participation rule changed.
 */

import { formatInTimeZone } from "date-fns-tz";
import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchOrgTimeZoneIana } from "@/lib/admin/orgLocalDayBounds";
import { resolveAssignmentTimes } from "@/lib/assignmentTime/resolveAssignmentTime";
import { effectiveAttendanceEvents } from "@/lib/childcareOperational/attendance/attendanceFold";
import { listAttendanceEvents } from "@/lib/childcareOperational/attendance/attendanceService";
import { buildRoomConfigResolvers } from "@/lib/childcareOperational/config/roomConfigResolvers";
import { resolveRequiredStaffForChildren } from "@/lib/childcareOperational/capacity/resolveRatio";
import { expandExpectedAttendance } from "@/lib/childcareOperational/expectations/scheduleExpectationCore";
import { loadOperationalExpectationInputs } from "@/lib/childcareOperational/expectations/loadOperationalExpectationInputs";
import { buildStaffSupply } from "@/lib/scheduling/supply/buildStaffSupply";
import { fetchAvailabilityBatch } from "@/lib/staffAvailability/staffAvailabilityBatch";
import { effectiveCoverageForSite } from "@/lib/staffCoverage/staffCoverageService";
import { effectiveStaffPresenceEvents } from "@/lib/staffPresence/staffPresenceFold";
import { listStaffPresenceForSiteDate } from "@/lib/staffPresence/staffPresenceService";
import {
    buildStaffingProjectionDay,
    type ProjectionChildActual,
    type ProjectionChildExpected,
    type ProjectionStaffInput,
} from "@/lib/staffingProjection/buildStaffingProjection";
import { foldObservedIntervals, type LocalObservation } from "@/lib/staffingProjection/observedIntervals";
import { toInterval, type TimeInterval } from "@/lib/staffingProjection/staffingSegments";
import type { StaffingProjectionDay, StaffingProjectionResult } from "@/lib/staffingProjection/staffingProjectionTypes";

export type FetchStaffingProjectionInput = {
    orgId: string;
    siteLocationId: string;
    dateStart: string;
    dateEnd: string;
    /**
     * The moment an unclosed observation is considered to run to, on the org's
     * wall clock. Omitted means open observations end where they started and
     * contribute nothing — correct for a historical day, wrong for this morning.
     */
    openObservationsEndAt?: string | null;
};

function enumerateDates(dateStart: string, dateEnd: string): string[] {
    const out: string[] = [];
    const [y, m, d] = dateStart.split("-").map(Number);
    const cursor = new Date(Date.UTC(y, m - 1, d));
    for (let i = 0; i < 366; i += 1) {
        const ymd = cursor.toISOString().slice(0, 10);
        if (ymd > dateEnd) break;
        out.push(ymd);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return out;
}

function weekdayOf(ymd: string): number {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Intervals an Assignment runs on one weekday. Empty means hours are unknown. */
function intervalsForWeekday(
    time: { days: { weekday: number; hoursKnown: boolean; intervals: { startTime: string; endTime: string }[] }[] } | null,
    weekday: number
): { intervals: TimeInterval[]; hoursKnown: boolean } {
    const day = time?.days.find((d) => d.weekday === weekday);
    if (!day || !day.hoursKnown) return { intervals: [], hoursKnown: false };
    const intervals = day.intervals
        .map((i) => toInterval(i.startTime, i.endTime))
        .filter((i): i is TimeInterval => i !== null);
    return { intervals, hoursKnown: intervals.length > 0 };
}

export async function fetchStaffingProjection(
    supabase: SupabaseClient,
    input: FetchStaffingProjectionInput
): Promise<StaffingProjectionResult> {
    const { orgId, siteLocationId, dateStart, dateEnd } = input;
    const dates = enumerateDates(dateStart, dateEnd);

    /*
     * ── WHAT WAITS FOR WHAT ──
     *
     * Read as one chain this cost a Day view 2.7 seconds, and almost none of it
     * was work: the timezone waited for nothing, the supply read waited for the
     * expectation loader it shares no input with, and three more reads waited
     * inside the day loop, once per day.
     *
     * The dependencies are only these. Assignment hours need the assignment ids,
     * which come from the expectations and the supply read. Availability needs the
     * employment ids, which come from the supply read. Everything else is
     * independent and now says so.
     */
    const [timeZone, loaded, supply] = await Promise.all([
        fetchOrgTimeZoneIana(supabase, orgId),
        loadOperationalExpectationInputs(supabase, { orgId, siteLocationId }),
        buildStaffSupply(supabase, { orgId, siteLocationId, dateStart, dateEnd }),
    ]);
    const localHhmmOf = (iso: string): string => formatInTimeZone(new Date(iso), timeZone, "HH:mm");

    const expected = expandExpectedAttendance({
        dateStart,
        dateEnd,
        agreements: loaded.agreements,
        placements: loaded.placements,
        assignments: loaded.assignments,
        patternsById: loaded.patternsById,
    });
    const { resolveTiers } = buildRoomConfigResolvers({
        agreements: loaded.agreements,
        placements: loaded.placements,
        config: loaded.config,
        ageGroupByRoomLocationId: loaded.ageGroupByRoomLocationId,
        ageGroupByProgramCategoryId: loaded.ageGroupByProgramCategoryId,
    });

    const childAssignmentIds = [...new Set(expected.map((e) => e.assignmentId))];
    const staffAssignmentIds = [...new Set(supply.members.map((m) => m.assignmentId))];
    const employmentIds = [...new Set(supply.members.map((m) => m.employmentId).filter((v): v is string => Boolean(v)))];

    /*
     * The day-scoped reads, hoisted out of the day loop and asked once for the
     * whole window. Coverage and Attendance already accepted a range and were
     * being called a day at a time; Presence answers one date, so it is asked for
     * every date at once rather than one after another — still through the
     * function that owns the read, bounded by the route's 31-day ceiling.
     */
    const [assignmentTimes, availability, coverageAll, attendanceAll, presenceByDate] = await Promise.all([
        resolveAssignmentTimes(supabase, {
            orgId,
            assignmentIds: [...childAssignmentIds, ...staffAssignmentIds],
            patternWeekdaysByAssignment: new Map(),
        }),
        fetchAvailabilityBatch(supabase, { orgId, employmentIds, dates }),
        effectiveCoverageForSite(supabase, {
            orgId,
            siteLocationId,
            dateFrom: dateStart,
            dateTo: dateEnd,
            roomLocationId: null,
        }),
        listAttendanceEvents(supabase, orgId, {
            siteLocationId,
            serviceDateStart: dateStart,
            serviceDateEnd: dateEnd,
        }),
        Promise.all(
            dates.map(async (d) =>
                [d, await listStaffPresenceForSiteDate(supabase, orgId, siteLocationId, d)] as const
            )
        ).then((entries) => new Map(entries)),
    ]);

    const coverageByDate = new Map<string, typeof coverageAll>();
    for (const c of coverageAll) {
        coverageByDate.set(c.serviceDate, [...(coverageByDate.get(c.serviceDate) ?? []), c]);
    }
    const attendanceByDate = new Map<string, typeof attendanceAll>();
    for (const e of attendanceAll) {
        attendanceByDate.set(e.service_date, [...(attendanceByDate.get(e.service_date) ?? []), e]);
    }

    const roomNameById = new Map<string, string | null>(
        supply.members
            .filter((m) => m.roomLocationId)
            .map((m) => [String(m.roomLocationId), m.roomName])
    );

    const days: StaffingProjectionDay[] = [];

    for (const date of dates) {
        const weekday = weekdayOf(date);

        const children: ProjectionChildExpected[] = expected
            .filter((e) => e.date === date)
            .map((e) => {
                const { intervals, hoursKnown } = intervalsForWeekday(
                    assignmentTimes.get(e.assignmentId) ?? null,
                    weekday
                );
                return {
                    customerMemberId: e.customerMemberId,
                    agreementId: e.agreementId,
                    assignmentId: e.assignmentId,
                    roomLocationId: e.roomLocationId,
                    intervals,
                    hoursKnown,
                };
            });

        // Which people are supply that day, and in which baseline room, is the
        // supply read's own answer — cells already encode every eligibility rule.
        const baselineByAssignment = new Map<string, { roomLocationId: string | null }>();
        for (const cell of supply.cells) {
            if (cell.date !== date) continue;
            for (const m of cell.scheduledStaff) {
                baselineByAssignment.set(m.assignmentId, { roomLocationId: cell.roomLocationId });
            }
        }

        const coverage = coverageByDate.get(date) ?? [];
        const coverageByEmployment = new Map<
            string,
            { coverageId: string; roomLocationId: string | null; interval: TimeInterval }[]
        >();
        for (const c of coverage) {
            const interval = toInterval(c.startTime, c.endTime);
            if (!interval) continue;
            const list = coverageByEmployment.get(c.employmentId) ?? [];
            list.push({ coverageId: c.id, roomLocationId: c.roomLocationId, interval });
            coverageByEmployment.set(c.employmentId, list);
        }

        const presenceRows = effectiveStaffPresenceEvents(presenceByDate.get(date) ?? []);
        const presenceObservations: LocalObservation[] = presenceRows
            .map((e): LocalObservation | null => {
                const at = localHhmmOf(e.event_at);
                if (e.event_kind === "absence") return null;
                // Presence has no transfer kind: a later `present` in another room
                // is how a staff room change is recorded, and `open` already closes
                // whatever interval was running.
                const kind = e.event_kind === "check_out" ? ("close" as const) : ("open" as const);
                return { subjectId: e.employment_id, at, kind, roomLocationId: e.room_location_id };
            })
            .filter((o): o is LocalObservation => o !== null);
        const presenceIntervals = foldObservedIntervals(
            presenceObservations,
            input.openObservationsEndAt ?? null
        );

        const attendanceRows = effectiveAttendanceEvents(attendanceByDate.get(date) ?? []);
        const attendanceObservations: LocalObservation[] = attendanceRows
            .map((e): LocalObservation | null => {
                if (e.event_kind === "absence") return null;
                const at = localHhmmOf(e.event_at);
                const kind =
                    e.event_kind === "check_out"
                        ? ("close" as const)
                        : e.event_kind === "room_transfer"
                          ? ("move" as const)
                          : ("open" as const);
                const room =
                    e.event_kind === "room_transfer"
                        ? (e.to_room_location_id ?? e.room_location_id)
                        : e.room_location_id;
                return { subjectId: e.customer_member_id, at, kind, roomLocationId: room };
            })
            .filter((o): o is LocalObservation => o !== null);
        const childActuals: ProjectionChildActual[] = foldObservedIntervals(
            attendanceObservations,
            input.openObservationsEndAt ?? null
        ).map((o) => ({
            customerMemberId: o.subjectId,
            roomLocationId: o.roomLocationId,
            interval: o.interval,
        }));

        const staff: ProjectionStaffInput[] = supply.members
            .filter((m) => baselineByAssignment.has(m.assignmentId) || m.employmentId)
            .map((m) => {
                const baseline = baselineByAssignment.get(m.assignmentId);
                const { intervals, hoursKnown } = baseline
                    ? intervalsForWeekday(assignmentTimes.get(m.assignmentId) ?? null, weekday)
                    : { intervals: [] as TimeInterval[], hoursKnown: false };
                const employmentKey = m.employmentId ?? `person:${m.personId}`;
                const resolved = m.employmentId
                    ? availability.byEmployment.get(m.employmentId)?.get(date)
                    : undefined;
                /*
                 * The resolver's provenance is the point, not just its windows.
                 * `no_pattern` means nothing was ever authored — UNKNOWN — and it
                 * must not arrive here as an empty window list indistinguishable
                 * from "recorded, and the answer is no".
                 */
                const recorded = resolved != null && resolved.provenance.kind !== "no_pattern";
                const availabilityIntervals = (resolved?.windows ?? [])
                    .map((w) => toInterval(w.start_time, w.end_time))
                    .filter((i): i is TimeInterval => i !== null);
                return {
                    employmentId: employmentKey,
                    personId: m.personId,
                    displayName: m.displayName,
                    assignmentId: m.assignmentId,
                    baselineRoomLocationId: baseline?.roomLocationId ?? m.roomLocationId,
                    baselineIntervals: baseline ? intervals : [],
                    baselineHoursKnown: baseline ? hoursKnown : true,
                    availability: {
                        recorded,
                        intervals: availabilityIntervals,
                        unavailableReason: resolved?.provenance.reason ?? null,
                    },
                    coverage: m.employmentId ? (coverageByEmployment.get(m.employmentId) ?? []) : [],
                    presence: presenceRows.length > 0
                        ? presenceIntervals
                              .filter((p) => p.subjectId === m.employmentId)
                              .map((p) => ({ roomLocationId: p.roomLocationId, interval: p.interval }))
                        : null,
                };
            });

        days.push(
            buildStaffingProjectionDay({
                orgId,
                siteLocationId,
                date,
                children,
                childActuals,
                staff,
                requiredStaffFor: (roomLocationId, childCount) =>
                    roomLocationId == null
                        ? { requiredStaff: 0, exceedsDefinedTiers: false }
                        : resolveRequiredStaffForChildren(resolveTiers(roomLocationId, date), childCount),
                roomNameById,
                actualsObserved: presenceRows.length > 0 || attendanceRows.length > 0,
                unknowns: supply.unresolved.map((u) => ({
                    code: "assignment_type_unclassified" as const,
                    assignmentId: u.assignmentId,
                    personId: u.personId,
                })),
            })
        );
    }

    return { orgId, siteLocationId, dateStart, dateEnd, days };
}
