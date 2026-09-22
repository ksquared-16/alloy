/**
 * STAFF AVAILABILITY — the pure resolver.
 *
 * One question: on this local date, when can this employment work?
 *
 * ── PRECEDENCE IS REPLACEMENT, NEVER ADDITION ──
 *
 * An active exception for a date REPLACES the recurring pattern for that date. It
 * does not merge with it, and it does not subtract from it. Additive behaviour has
 * no single answer for the ordinary case — "unavailable Friday" beside a recurring
 * Friday window — and a resolver that had to guess would be guessing about whether
 * someone can be asked to work.
 *
 *   any active `unavailable` exception   -> no windows at all that date
 *   otherwise, active `available` rows   -> exactly those windows
 *   otherwise                            -> the recurring pattern in force
 *
 * `unavailable` outranks `available` on the same date deliberately: two operators
 * disagreeing should fail closed, because offering someone as available when a
 * colleague recorded them as unavailable is the worse error.
 *
 * ── TIME IS LOCAL INTENT ──
 *
 * Every time here is the organisation's wall clock, and every date is its calendar
 * day. Nothing converts to an instant, which is what makes the answer survive a DST
 * change: "07:30-16:30" means the same thing the morning the clocks move, and an
 * absolute-time equivalent would not. Callers resolve the org day with the existing
 * timezone contract and hand it in; this module never reads a clock.
 */

export type AvailabilityExceptionKind = "unavailable" | "available";

export type StaffAvailabilityWindowRow = {
    id: string;
    org_id: string;
    employment_id: string;
    /** 0 = Sunday, matching childcare_operating_windows. */
    weekday: number;
    start_time: string;
    end_time: string;
    effective_start: string;
    effective_end: string | null;
    is_active: boolean;
};

export type StaffAvailabilityExceptionRow = {
    id: string;
    org_id: string;
    employment_id: string;
    exception_date: string;
    exception_kind: AvailabilityExceptionKind;
    start_time: string | null;
    end_time: string | null;
    reason: string | null;
    is_active: boolean;
};

/** One resolved window, carrying WHY it applies. */
export type ResolvedAvailabilityWindow = {
    start_time: string;
    end_time: string;
    source: "recurring" | "exception";
    sourceId: string;
};

export type ResolvedAvailability = {
    /** The organisation's calendar day this answer is about. */
    date: string;
    weekday: number;
    available: boolean;
    windows: ResolvedAvailabilityWindow[];
    /**
     * Why the answer is what it is — the UI shows this, and an operator who cannot
     * see the reason cannot correct it.
     */
    provenance: {
        kind: "recurring" | "exception_unavailable" | "exception_available" | "no_pattern";
        exceptionId: string | null;
        reason: string | null;
        /** Recurring rows that WOULD have applied, kept even when an exception wins. */
        supersededRecurringIds: string[];
    };
};

/** `YYYY-MM-DD` → weekday index, computed without a timezone so it cannot drift. */
export function weekdayOfYmd(ymd: string): number {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    if (!m) return -1;
    // UTC construction on purpose: the date is already the org's calendar day, and
    // a local Date() would re-interpret it against the server's zone.
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
}

/** Is this recurring row in force on the given org day? */
export function windowAppliesOn(row: StaffAvailabilityWindowRow, ymd: string): boolean {
    if (!row.is_active) return false;
    if (row.effective_start > ymd) return false;
    // `effective_end` is INCLUSIVE: a pattern ending today still applies today.
    if (row.effective_end && row.effective_end < ymd) return false;
    return row.weekday === weekdayOfYmd(ymd);
}

function byStart(a: { start_time: string }, b: { start_time: string }): number {
    return a.start_time.localeCompare(b.start_time);
}

/**
 * The canonical answer. Recurring pattern plus applicable exceptions, combined by
 * the precedence above.
 */
export function resolveAvailabilityForDate(
    windows: readonly StaffAvailabilityWindowRow[],
    exceptions: readonly StaffAvailabilityExceptionRow[],
    ymd: string,
): ResolvedAvailability {
    const weekday = weekdayOfYmd(ymd);
    const recurring = windows.filter((w) => windowAppliesOn(w, ymd));
    const supersededRecurringIds = recurring.map((w) => w.id);
    const dated = exceptions.filter((e) => e.is_active && e.exception_date === ymd);

    // Fail closed: an `unavailable` exception wins over an `available` one.
    const blocking = dated.find((e) => e.exception_kind === "unavailable");
    if (blocking) {
        return {
            date: ymd,
            weekday,
            available: false,
            windows: [],
            provenance: {
                kind: "exception_unavailable",
                exceptionId: blocking.id,
                reason: blocking.reason,
                supersededRecurringIds,
            },
        };
    }

    const granting = dated.filter((e) => e.exception_kind === "available");
    if (granting.length > 0) {
        const resolved = granting
            .map((e) => ({
                start_time: e.start_time!,
                end_time: e.end_time!,
                source: "exception" as const,
                sourceId: e.id,
            }))
            .sort(byStart);
        return {
            date: ymd,
            weekday,
            available: true,
            windows: resolved,
            provenance: {
                kind: "exception_available",
                exceptionId: granting[0]!.id,
                reason: granting[0]!.reason,
                supersededRecurringIds,
            },
        };
    }

    if (recurring.length === 0) {
        // No pattern in force is a real answer — "not available" — and it is
        // distinguished from "an exception made them unavailable", because the two
        // send an operator to different places.
        return {
            date: ymd,
            weekday,
            available: false,
            windows: [],
            provenance: { kind: "no_pattern", exceptionId: null, reason: null, supersededRecurringIds: [] },
        };
    }

    return {
        date: ymd,
        weekday,
        available: true,
        windows: recurring
            .map((w) => ({
                start_time: w.start_time,
                end_time: w.end_time,
                source: "recurring" as const,
                sourceId: w.id,
            }))
            .sort(byStart),
        provenance: { kind: "recurring", exceptionId: null, reason: null, supersededRecurringIds: [] },
    };
}

/** Is the employment available at a specific local time on that date? */
export function isAvailableAt(resolved: ResolvedAvailability, localTime: string): boolean {
    // End-exclusive: a window of 07:30-16:30 does not make 16:30 workable, which is
    // how an operating window is read everywhere else in the platform.
    return resolved.windows.some((w) => localTime >= w.start_time && localTime < w.end_time);
}

/** The recurring pattern in force on a day, grouped by weekday — what the card shows. */
export function recurringPatternOn(
    windows: readonly StaffAvailabilityWindowRow[],
    ymd: string,
): Map<number, StaffAvailabilityWindowRow[]> {
    const out = new Map<number, StaffAvailabilityWindowRow[]>();
    for (const w of windows) {
        if (!w.is_active) continue;
        if (w.effective_start > ymd) continue;
        if (w.effective_end && w.effective_end < ymd) continue;
        const list = out.get(w.weekday) ?? [];
        list.push(w);
        out.set(w.weekday, list.sort(byStart));
    }
    return out;
}
