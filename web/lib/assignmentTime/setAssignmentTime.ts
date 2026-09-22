/**
 * THE ONE WRITE FOR "WHEN DOES THIS ASSIGNMENT RUN".
 *
 * `resolveAssignmentTime` is the one read; this is its counterpart, and until now
 * there was none. Hours could only arrive by trigger, from a pattern, at the
 * moment an Assignment was created — so an operator could not give an Assignment
 * hours afterwards, could not change them, and could not work different hours on
 * different weekdays, because the seed writes one arrive/depart pair across every
 * weekday it materialises.
 *
 * The whole week is replaced in one call. That is deliberate: an interface that
 * patched one weekday at a time would leave the others' fate ambiguous, and the
 * question an operator answers is "which days, and what hours" — a week, not a
 * sequence of edits.
 *
 * UNKNOWN survives. A weekday with no times is a weekday that recurs with hours
 * nobody has recorded, which is a different fact from a weekday that does not
 * recur, and both are expressible here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** One weekday's intent. Omit the times to say the hours are not known. */
export type AssignmentTimeDayInput = {
    /** 0 = Sunday. */
    weekday: number;
    /** "HH:MM". Both times or neither. */
    startTime?: string | null;
    endTime?: string | null;
};

export class AssignmentTimeRejectedError extends Error {
    readonly code = "assignment_time_rejected";
    constructor(message: string) {
        super(message);
        this.name = "AssignmentTimeRejectedError";
    }
}

const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/**
 * Storage enforcement translated into something an operator can act on.
 *
 * The function speaks in weekday numbers and SQLSTATEs; an operator needs to be
 * told which day is wrong and why, and never to see a constraint name.
 */
function translate(message: string): never {
    const m = message.toLowerCase();
    if (m.includes("must end after it starts")) {
        throw new AssignmentTimeRejectedError("A day must end after it starts.");
    }
    if (m.includes("half an interval")) {
        throw new AssignmentTimeRejectedError("Give a day both a start and an end time, or neither.");
    }
    if (m.includes("is not 0-6")) {
        throw new AssignmentTimeRejectedError("That is not a day of the week.");
    }
    if (m.includes("not found")) {
        throw new AssignmentTimeRejectedError("That assignment was not found.");
    }
    throw new AssignmentTimeRejectedError("Those hours could not be saved.");
}

/** Validate before the round trip, so the common mistakes read as sentences. */
export function validateAssignmentTimeDays(days: readonly AssignmentTimeDayInput[]): string[] {
    const problems: string[] = [];
    const seen = new Set<string>();
    for (const d of days) {
        if (!Number.isInteger(d.weekday) || d.weekday < 0 || d.weekday > 6) {
            problems.push("That is not a day of the week.");
            continue;
        }
        const start = (d.startTime ?? "").trim();
        const end = (d.endTime ?? "").trim();
        if (Boolean(start) !== Boolean(end)) {
            problems.push("Give a day both a start and an end time, or neither.");
            continue;
        }
        if (start && (!HHMM.test(start) || !HHMM.test(end))) {
            problems.push("Times are entered as HH:MM on a 24-hour clock.");
            continue;
        }
        if (start && end <= start) {
            problems.push("A day must end after it starts.");
            continue;
        }
        // One unknown row per weekday, and one interval per start time — the same
        // shape storage enforces, said earlier and in words.
        const key = `${d.weekday}|${start || "unknown"}`;
        if (seen.has(key)) {
            problems.push("That day already has an interval starting at the same time.");
            continue;
        }
        seen.add(key);
    }
    return [...new Set(problems)];
}

/**
 * Replace an Assignment's recurring hours. Returns how many weekday rows now exist.
 *
 * Nothing here touches the reusable pattern: the Assignment owns its own time, and
 * that independence is the half of the Slice 1 model this write had to preserve.
 */
export async function setAssignmentTime(
    supabase: SupabaseClient,
    input: {
        assignmentId: string;
        days: readonly AssignmentTimeDayInput[];
        actorUserId?: string | null;
    }
): Promise<number> {
    const problems = validateAssignmentTimeDays(input.days);
    if (problems.length > 0) throw new AssignmentTimeRejectedError(problems[0]);

    const { data, error } = await supabase.rpc("set_assignment_weekday_intervals", {
        p_assignment_id: input.assignmentId,
        p_days: input.days.map((d) => ({
            weekday: d.weekday,
            start_time: (d.startTime ?? "").trim() || null,
            end_time: (d.endTime ?? "").trim() || null,
        })),
        p_actor: input.actorUserId ?? null,
    });
    if (error) translate(error.message);
    return Number(data ?? 0);
}
