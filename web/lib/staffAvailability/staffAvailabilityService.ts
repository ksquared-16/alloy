import type { SupabaseClient } from "@supabase/supabase-js";

import {
    resolveAvailabilityForDate,
    type ResolvedAvailability,
    type StaffAvailabilityExceptionRow,
    type StaffAvailabilityWindowRow,
} from "@/lib/staffAvailability/staffAvailabilityModel";

/**
 * Availability reads and writes. Server-authoritative: every write re-checks that
 * the employment belongs to the caller's organization, so the grain is never taken
 * on trust from a payload.
 */
export class StaffAvailabilityError extends Error {
    constructor(
        readonly code: "invalid_input" | "not_found" | "conflict" | "db_error",
        message: string,
    ) {
        super(message);
        this.name = "StaffAvailabilityError";
    }
}

const WINDOW_COLUMNS =
    "id, org_id, employment_id, weekday, start_time, end_time, effective_start, effective_end, is_active";
const EXCEPTION_COLUMNS =
    "id, org_id, employment_id, exception_date, exception_kind, start_time, end_time, reason, is_active";

function trim(v: unknown): string {
    return v == null ? "" : String(v).trim();
}

/** `HH:MM` or `HH:MM:SS`, normalised to `HH:MM:SS` so comparisons are lexical. */
export function normalizeTime(value: unknown): string | null {
    const s = trim(value);
    const m = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(s);
    if (!m) return null;
    return `${m[1]}:${m[2]}:${m[3] ?? "00"}`;
}

export function isValidYmd(value: unknown): boolean {
    const s = trim(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** The employment must be this organization's. Asked before every write. */
async function assertEmploymentInOrg(
    supabase: SupabaseClient,
    orgId: string,
    employmentId: string,
): Promise<void> {
    const { data } = await supabase
        .from("employments").select("id").eq("id", employmentId).eq("org_id", orgId).maybeSingle();
    if (!data) {
        throw new StaffAvailabilityError("not_found", "That employment does not belong to this organization.");
    }
}

export async function listAvailabilityWindows(
    supabase: SupabaseClient,
    orgId: string,
    employmentId: string,
): Promise<StaffAvailabilityWindowRow[]> {
    const { data, error } = await supabase
        .from("staff_availability_windows")
        .select(WINDOW_COLUMNS)
        .eq("org_id", orgId)
        .eq("employment_id", employmentId)
        .order("weekday")
        .order("start_time");
    if (error) throw new StaffAvailabilityError("db_error", error.message);
    // The generated Supabase types do not know these tables yet; the SHAPE is
    // guaranteed by the column list above.
    return (data ?? []) as unknown as StaffAvailabilityWindowRow[];
}

export async function listAvailabilityExceptions(
    supabase: SupabaseClient,
    orgId: string,
    employmentId: string,
): Promise<StaffAvailabilityExceptionRow[]> {
    const { data, error } = await supabase
        .from("staff_availability_exceptions")
        .select(EXCEPTION_COLUMNS)
        .eq("org_id", orgId)
        .eq("employment_id", employmentId)
        .order("exception_date", { ascending: false });
    if (error) throw new StaffAvailabilityError("db_error", error.message);
    return (data ?? []) as unknown as StaffAvailabilityExceptionRow[];
}

/** The composed answer for one employment on one organisation day. */
export async function resolveAvailabilityForEmployment(
    supabase: SupabaseClient,
    orgId: string,
    employmentId: string,
    ymd: string,
): Promise<ResolvedAvailability & { windows_all: StaffAvailabilityWindowRow[]; exceptions_all: StaffAvailabilityExceptionRow[] }> {
    const [windows, exceptions] = await Promise.all([
        listAvailabilityWindows(supabase, orgId, employmentId),
        listAvailabilityExceptions(supabase, orgId, employmentId),
    ]);
    return {
        ...resolveAvailabilityForDate(windows, exceptions, ymd),
        windows_all: windows,
        exceptions_all: exceptions,
    };
}

export type SetAvailabilityInput = {
    orgId: string;
    employmentId: string;
    effectiveStart: string;
    effectiveEnd?: string | null;
    /** The whole week, as the operator means it. A weekday with no window is unavailable. */
    windows: readonly { weekday: number; startTime: string; endTime: string }[];
    actorUserId?: string | null;
};

/**
 * SET the recurring pattern — a supersession, not an edit.
 *
 * The previous pattern is END-DATED the day before the new one begins rather than
 * deleted or rewritten. Past scheduling context stays knowable, which is the whole
 * reason availability is effective-dated: someone asking "was she available that
 * Tuesday in March" must still be able to find out after the pattern changed.
 */
export async function setRecurringAvailability(
    supabase: SupabaseClient,
    input: SetAvailabilityInput,
) {
    const orgId = trim(input.orgId);
    const employmentId = trim(input.employmentId);
    if (!orgId || !employmentId) {
        throw new StaffAvailabilityError("invalid_input", "Organization and employment are required.");
    }
    if (!isValidYmd(input.effectiveStart)) {
        throw new StaffAvailabilityError("invalid_input", "A valid effective start date is required.");
    }
    const effectiveEnd = input.effectiveEnd ? trim(input.effectiveEnd) : null;
    if (effectiveEnd && !isValidYmd(effectiveEnd)) {
        throw new StaffAvailabilityError("invalid_input", "The effective end date is not a valid date.");
    }
    if (effectiveEnd && effectiveEnd < input.effectiveStart) {
        throw new StaffAvailabilityError("invalid_input", "Availability cannot end before it begins.");
    }
    const rows = input.windows.map((w) => {
        const start = normalizeTime(w.startTime);
        const end = normalizeTime(w.endTime);
        if (!Number.isInteger(w.weekday) || w.weekday < 0 || w.weekday > 6) {
            throw new StaffAvailabilityError("invalid_input", "Each window needs a weekday from 0 to 6.");
        }
        if (!start || !end) {
            throw new StaffAvailabilityError("invalid_input", "Each window needs valid start and end times.");
        }
        if (end <= start) {
            throw new StaffAvailabilityError("invalid_input", "A window must end after it starts.");
        }
        return { weekday: w.weekday, start_time: start, end_time: end };
    });
    // Overlap on one weekday is rejected: two overlapping windows say the same
    // thing twice and make "how many hours" ambiguous.
    const byDay = new Map<number, { start_time: string; end_time: string }[]>();
    for (const r of rows) {
        const list = byDay.get(r.weekday) ?? [];
        for (const other of list) {
            if (r.start_time < other.end_time && other.start_time < r.end_time) {
                throw new StaffAvailabilityError("conflict", "Two windows on the same day overlap.");
            }
        }
        list.push(r);
        byDay.set(r.weekday, list);
    }

    await assertEmploymentInOrg(supabase, orgId, employmentId);

    // End-date what is currently open, the day before the new pattern starts.
    const dayBefore = new Date(`${input.effectiveStart}T00:00:00Z`);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
    const priorEnd = dayBefore.toISOString().slice(0, 10);
    /*
     * END-DATE EVERY PATTERN THAT WOULD STILL BE IN FORCE, not only the open ones.
     *
     * This asked for `effective_end IS NULL`, which silently did nothing once a
     * FUTURE pattern had been authored: setting the future one end-dates the
     * current one, and the current one then no longer matched. An operator who
     * then asked to close availability from a date got no error and no change —
     * the pattern kept applying. Found by mounted certification, where a week that
     * had been closed still resolved `recurring`.
     *
     * The honest predicate is "starts before the new pattern AND has not already
     * finished before it", which covers both the open-ended case and a pattern
     * whose end lies on or after the new start.
     */
    const { error: closeErr } = await supabase
        .from("staff_availability_windows")
        .update({ effective_end: priorEnd, updated_by: trim(input.actorUserId) || null, updated_at: new Date().toISOString() })
        .eq("org_id", orgId)
        .eq("employment_id", employmentId)
        .eq("is_active", true)
        .lt("effective_start", input.effectiveStart)
        .or(`effective_end.is.null,effective_end.gte.${input.effectiveStart}`);
    if (closeErr) throw new StaffAvailabilityError("db_error", closeErr.message);

    if (rows.length === 0) return { superseded_to: priorEnd, windows: [] };

    const { data, error } = await supabase
        .from("staff_availability_windows")
        .insert(rows.map((r) => ({
            org_id: orgId,
            employment_id: employmentId,
            weekday: r.weekday,
            start_time: r.start_time,
            end_time: r.end_time,
            effective_start: input.effectiveStart,
            effective_end: effectiveEnd,
            created_by: trim(input.actorUserId) || null,
            updated_by: trim(input.actorUserId) || null,
        })))
        .select(WINDOW_COLUMNS);
    if (error) throw new StaffAvailabilityError("db_error", error.message);
    return { superseded_to: priorEnd, windows: (data ?? []) as unknown as StaffAvailabilityWindowRow[] };
}

export type AddExceptionInput = {
    orgId: string;
    employmentId: string;
    date: string;
    kind: "unavailable" | "available";
    startTime?: string | null;
    endTime?: string | null;
    reason?: string | null;
    actorUserId?: string | null;
};

/** Add a dated exception. The shape is checked here as well as by the CHECK constraint. */
export async function addAvailabilityException(supabase: SupabaseClient, input: AddExceptionInput) {
    const orgId = trim(input.orgId);
    const employmentId = trim(input.employmentId);
    if (!orgId || !employmentId) {
        throw new StaffAvailabilityError("invalid_input", "Organization and employment are required.");
    }
    if (!isValidYmd(input.date)) {
        throw new StaffAvailabilityError("invalid_input", "A valid exception date is required.");
    }
    if (input.kind !== "unavailable" && input.kind !== "available") {
        throw new StaffAvailabilityError("invalid_input", "An exception is either unavailable or available.");
    }
    let start: string | null = null;
    let end: string | null = null;
    if (input.kind === "available") {
        start = normalizeTime(input.startTime);
        end = normalizeTime(input.endTime);
        if (!start || !end) {
            throw new StaffAvailabilityError("invalid_input", "An available exception needs start and end times.");
        }
        if (end <= start) {
            throw new StaffAvailabilityError("invalid_input", "A window must end after it starts.");
        }
    }
    await assertEmploymentInOrg(supabase, orgId, employmentId);
    const { data, error } = await supabase
        .from("staff_availability_exceptions")
        .insert({
            org_id: orgId,
            employment_id: employmentId,
            exception_date: trim(input.date),
            exception_kind: input.kind,
            start_time: start,
            end_time: end,
            reason: trim(input.reason) || null,
            created_by: trim(input.actorUserId) || null,
            updated_by: trim(input.actorUserId) || null,
        })
        .select(EXCEPTION_COLUMNS)
        .single();
    if (error) throw new StaffAvailabilityError("db_error", error.message);
    return data as unknown as StaffAvailabilityExceptionRow;
}

/**
 * Cancel an exception by DEACTIVATING it.
 *
 * Not a delete: the record that someone was marked unavailable on a date is part of
 * why a schedule looked the way it did, and erasing it would make that unknowable.
 */
export async function cancelAvailabilityException(
    supabase: SupabaseClient,
    orgId: string,
    exceptionId: string,
    actorUserId: string | null,
) {
    const { data, error } = await supabase
        .from("staff_availability_exceptions")
        .update({ is_active: false, updated_by: trim(actorUserId) || null, updated_at: new Date().toISOString() })
        .eq("id", trim(exceptionId))
        .eq("org_id", trim(orgId))
        .select(EXCEPTION_COLUMNS)
        .single();
    if (error) throw new StaffAvailabilityError("db_error", error.message);
    if (!data) throw new StaffAvailabilityError("not_found", "That exception was not found.");
    return data as unknown as StaffAvailabilityExceptionRow;
}
