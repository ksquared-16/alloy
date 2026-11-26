/**
 * WHAT THE ATTENDANCE FOLD ACTUALLY SPENDS, AS INTERVALS.
 *
 * Attendance became the first-order binding term the moment a specimen with an active enrolment was
 * measured: 1,111-1,147ms P50 across two cold populations, binding in 46 of 46 samples. The prior
 * ~125ms was the FAIL-CLOSED branch — `resolveAttendanceSubject` finding no attendable enrolment and
 * returning after one query — so nothing has ever measured what folding attendance costs.
 *
 * INTERVALS, NOT DURATIONS, for the reason this programme has now paid for twice: a duration says
 * how long a phase took, and only an interval says whether anything waited for it. Summing durations
 * across concurrent phases is what produced a repair that made the frame slower.
 */
export type AttendancePhaseMark = {
    /** `subject` | `events` | `expectations` | `site_rooms` | `room_labels` | `fold` */
    phase: string;
    start: number;
    end: number;
    /** Rows returned, where the phase is a read. */
    rows: number | null;
    /** Reads issued by this phase. */
    queries: number;
};

export type AttendanceTrace = {
    t0: number;
    marks: AttendancePhaseMark[];
    /** Which branch ran: the fail-closed short-circuit, or the full fold. */
    outcome: "short_circuit" | "full" | null;
};

export function newAttendanceTrace(t0: number = Date.now()): AttendanceTrace {
    return { t0, marks: [], outcome: null };
}

/** `startedAt` is an absolute `Date.now()`; offsets are computed here so no caller does it. */
export function markAttendancePhase(
    trace: AttendanceTrace | undefined,
    phase: string,
    startedAt: number,
    opts: { rows?: number | null; queries?: number } = {},
): void {
    if (!trace) return;
    trace.marks.push({
        phase,
        start: startedAt - trace.t0,
        end: Date.now() - trace.t0,
        rows: opts.rows ?? null,
        queries: opts.queries ?? 1,
    });
}
