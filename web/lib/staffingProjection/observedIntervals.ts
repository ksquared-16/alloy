/**
 * Observations, folded into intervals on the organisation's wall clock.
 *
 * Attendance and Presence are the same shape by design — the two folds were
 * deliberately built to share correction semantics — so one module reads both.
 * What the existing folds give is a day summary: first check-in, last check-out,
 * the set of rooms touched. A staffing projection cannot use that. "Rooms
 * observed: Toddler 1, Toddler 2" does not say which room at 09:15, and a
 * segment is exactly the question of which room when.
 *
 * ── AN OPEN INTERVAL IS NOT AN ALL-DAY INTERVAL ──
 *
 * At ten in the morning most of the day's check-ins have no check-out yet. The
 * honest close for those is the moment being asked about, not the end of the day
 * and not the check-in itself: the first invents attendance that has not
 * happened, and the second erases attendance that has. The caller supplies that
 * moment and the interval is flagged `openEnded`, so a consumer can tell an
 * observation that ended from one that simply has not.
 */

import { toHhmm, toInterval, type Hhmm, type TimeInterval } from "@/lib/staffingProjection/staffingSegments";

/** One event, already placed on the organisation's local clock. */
export type LocalObservation = {
    /** The person or child the observation is about. */
    subjectId: string;
    /** "HH:MM" in the org's local day. */
    at: Hhmm;
    kind: "open" | "move" | "close";
    /** The room the subject is in from this moment. Null means the site itself. */
    roomLocationId: string | null;
};

export type ObservedInterval = {
    subjectId: string;
    roomLocationId: string | null;
    interval: TimeInterval;
    /** True when nothing closed this interval and `openEndAt` did. */
    openEnded: boolean;
};

/**
 * Fold one day's observations into room-stamped intervals.
 *
 * Events must already be effective (corrections applied, reversals removed) and
 * must already be local — this module does no superseding and reads no clock, so
 * the correction rules stay in the one fold that owns them.
 */
export function foldObservedIntervals(
    observations: readonly LocalObservation[],
    openEndAt: Hhmm | null
): ObservedInterval[] {
    const bySubject = new Map<string, LocalObservation[]>();
    for (const o of observations) {
        bySubject.set(o.subjectId, [...(bySubject.get(o.subjectId) ?? []), o]);
    }

    const out: ObservedInterval[] = [];
    for (const [subjectId, list] of bySubject) {
        const sorted = list.slice().sort((a, b) => a.at.localeCompare(b.at));
        let openAt: Hhmm | null = null;
        let openRoom: string | null = null;

        const close = (at: Hhmm, openEnded: boolean) => {
            if (openAt == null) return;
            const interval = toInterval(openAt, at);
            if (interval) out.push({ subjectId, roomLocationId: openRoom, interval, openEnded });
            openAt = null;
        };

        for (const o of sorted) {
            if (o.kind === "close") {
                close(o.at, false);
                continue;
            }
            // `open` and `move` both start an interval in their room, and both end
            // whatever was open — a transfer is a close and an open at one instant.
            close(o.at, false);
            openAt = o.at;
            openRoom = o.roomLocationId;
        }

        if (openAt != null && openEndAt != null) close(openEndAt, true);
    }

    return out.sort(
        (a, b) => a.interval.start.localeCompare(b.interval.start) || a.subjectId.localeCompare(b.subjectId)
    );
}

/** The local "HH:MM" of an instant, or null when the instant is unusable. */
export function localHhmm(instantIso: string | null | undefined, formatInZone: (iso: string) => string): Hhmm | null {
    if (!instantIso) return null;
    try {
        return toHhmm(formatInZone(instantIso));
    } catch {
        return null;
    }
}
