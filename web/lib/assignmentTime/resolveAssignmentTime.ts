/**
 * THE ONE READ FOR "WHEN DOES THIS ASSIGNMENT RUN".
 *
 * Before this existed, every consumer answered the question itself by joining an
 * Assignment to its schedule pattern and parsing hours out of the pattern's metadata.
 * That made the pattern the de-facto authority: two Assignments sharing a pattern
 * necessarily shared hours, and one Assignment could not work different hours on
 * different weekdays at all.
 *
 * Hours now come from `assignment_weekday_intervals` and nowhere else.
 *
 * ── WEEKDAYS FALL BACK; HOURS NEVER DO ──
 *
 * Recurrence still falls back to the pattern's `weekdays` when an Assignment has no
 * interval rows yet, because the alternative is worse than it looks: `buildStaffSupply`
 * reads an empty weekday list as "runs every day", so an Assignment that lost its
 * recurrence would silently start supplying staff seven days a week. Hours have no
 * such fallback — an Assignment with no interval rows has UNKNOWN hours, and unknown
 * is reported as unknown.
 *
 * ── UNKNOWN IS A THIRD ANSWER ──
 *
 * A weekday is `known` (one or more intervals) or `unknown` (recurrence without
 * hours). Unknown is never rendered as all-day, never as site hours, and never as
 * zero. The database makes a half-known interval impossible, so a null here always
 * means unknown and never means "not filled in yet".
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** One timed interval. Both fields are present or the interval is not "known". */
export type AssignmentInterval = {
    startTime: string;
    endTime: string;
};

export type AssignmentTimeDay = {
    /** 0 = Sunday. */
    weekday: number;
    /** False when this weekday recurs but its hours are not recorded. */
    hoursKnown: boolean;
    /** Ordered by start time. Empty when `hoursKnown` is false. */
    intervals: AssignmentInterval[];
};

export type AssignmentTime = {
    assignmentId: string;
    /** Ascending, deduplicated. */
    weekdays: number[];
    /** Ascending by weekday. */
    days: AssignmentTimeDay[];
    /** Whether hours are recorded for all, some or none of the recurring weekdays. */
    hoursKnown: "all" | "partial" | "none";
    /** True when the Assignment owns interval rows; false when recurrence was inherited. */
    hasIntervals: boolean;
    /** Where the rows came from — an operator decision reads differently from a default. */
    sourceKeys: string[];
};

type IntervalRow = {
    assignment_id: string;
    weekday: number;
    start_time: string | null;
    end_time: string | null;
    source_key: string;
};

/** `time` comes back as HH:MM:SS; operators and the compact label both want HH:MM. */
function hhmm(value: string | null): string | null {
    if (!value) return null;
    return value.length >= 5 ? value.slice(0, 5) : value;
}

function buildAssignmentTime(assignmentId: string, rows: IntervalRow[]): AssignmentTime {
    const byWeekday = new Map<number, IntervalRow[]>();
    for (const r of rows) {
        const list = byWeekday.get(r.weekday) ?? [];
        list.push(r);
        byWeekday.set(r.weekday, list);
    }

    const days: AssignmentTimeDay[] = [...byWeekday.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([weekday, list]) => {
            const timed = list
                .filter((r) => r.start_time != null && r.end_time != null)
                .map((r) => ({ startTime: hhmm(r.start_time)!, endTime: hhmm(r.end_time)! }))
                .sort((a, b) => a.startTime.localeCompare(b.startTime));
            return { weekday, hoursKnown: timed.length > 0, intervals: timed };
        });

    const knownDays = days.filter((d) => d.hoursKnown).length;
    const hoursKnown: AssignmentTime["hoursKnown"] =
        days.length === 0 || knownDays === 0 ? "none" : knownDays === days.length ? "all" : "partial";

    return {
        assignmentId,
        weekdays: days.map((d) => d.weekday),
        days,
        hoursKnown,
        hasIntervals: rows.length > 0,
        sourceKeys: [...new Set(rows.map((r) => r.source_key))].sort(),
    };
}

export type ResolveAssignmentTimeInput = {
    orgId: string;
    assignmentIds: readonly string[];
    /**
     * Recurrence-only fallback, by assignment id. Supplied by callers that already
     * hold the pattern weekdays. Never carries hours.
     */
    patternWeekdaysByAssignment?: ReadonlyMap<string, number[]>;
};

/**
 * Batch by construction — one query for many Assignments, because the roster resolves
 * a whole site·week and an N+1 here would be felt immediately.
 */
export async function resolveAssignmentTimes(
    supabase: SupabaseClient,
    input: ResolveAssignmentTimeInput
): Promise<Map<string, AssignmentTime>> {
    const { orgId, assignmentIds, patternWeekdaysByAssignment } = input;
    const ids = [...new Set(assignmentIds)].filter(Boolean);
    const out = new Map<string, AssignmentTime>();
    if (ids.length === 0) return out;

    const { data, error } = await supabase
        .from("assignment_weekday_intervals")
        .select("assignment_id, weekday, start_time, end_time, source_key")
        .eq("org_id", orgId)
        .in("assignment_id", ids);
    if (error) throw new Error(`resolveAssignmentTimes: ${error.message}`);

    const rowsByAssignment = new Map<string, IntervalRow[]>();
    for (const r of (data ?? []) as IntervalRow[]) {
        const list = rowsByAssignment.get(r.assignment_id) ?? [];
        list.push(r);
        rowsByAssignment.set(r.assignment_id, list);
    }

    for (const id of ids) {
        const rows = rowsByAssignment.get(id) ?? [];
        if (rows.length > 0) {
            out.set(id, buildAssignmentTime(id, rows));
            continue;
        }
        // No interval rows: recurrence is inherited so supply does not silently become
        // every day, and hours stay unknown so nothing is invented.
        const weekdays = [...new Set(patternWeekdaysByAssignment?.get(id) ?? [])].sort((a, b) => a - b);
        out.set(id, {
            assignmentId: id,
            weekdays,
            days: weekdays.map((weekday) => ({ weekday, hoursKnown: false, intervals: [] })),
            hoursKnown: "none",
            hasIntervals: false,
            sourceKeys: [],
        });
    }

    return out;
}

/**
 * The single daily interval, when an Assignment has exactly one and it is the same on
 * every recurring weekday. Null for unknown hours, for a split day, and for a week
 * whose days differ — each of which is a real shape that a single label would misstate.
 */
export function uniformDailyInterval(time: AssignmentTime): AssignmentInterval | null {
    if (time.hoursKnown !== "all" || time.days.length === 0) return null;
    const first = time.days[0].intervals;
    if (first.length !== 1) return null;
    const candidate = first[0];
    for (const day of time.days) {
        if (day.intervals.length !== 1) return null;
        if (day.intervals[0].startTime !== candidate.startTime) return null;
        if (day.intervals[0].endTime !== candidate.endTime) return null;
    }
    return candidate;
}
