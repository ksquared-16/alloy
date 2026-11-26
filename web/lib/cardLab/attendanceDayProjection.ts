/**
 * Bounded day projection for the Attendance card.
 *
 * The underlying history is complete — `ChildAttendanceReadModel` keeps every
 * `checkInOutTimeline` and `roomMovementTimeline` entry. This is a PROJECTION RULE only: it
 * decides which of those the compact card shows, and it never drops a fact from the record.
 *
 * The rule is ordered by what an operator must never lose sight of:
 *
 *   1. check-in            — the day started, and when
 *   2. earliest movement   — where the day began, when that is not the check-in room
 *   3. …collapsed…         — a count, discoverable, never silent
 *   4. most recent movement(s)
 *   5. current location    — always the emphasised column
 *   6. check-out           — recorded, or the expected slot
 *
 * Head and tail are kept; the middle collapses. The card therefore has a fixed maximum width
 * budget of {@link MAX_DAY_STEPS} columns whether the child moved twice or twelve times, so it
 * neither widens, shrinks its type, nor grows taller as the day gets busier.
 */

import type { ProgressionStep } from "@/lib/cardLab/cardLabTypes";

/** Columns the compact card will render, collapse chip included. */
export const MAX_DAY_STEPS = 6;

export type DayProjection = {
    steps: ProgressionStep[];
    hiddenCount: number;
};

export function projectAttendanceDay(
    events: readonly ProgressionStep[],
    maxSteps: number = MAX_DAY_STEPS,
): DayProjection {
    if (events.length <= maxSteps) {
        return { steps: [...events], hiddenCount: 0 };
    }

    // Keep the first column (check-in), the earliest movement, and the last three (the two most
    // recent movements plus the check-out slot). Everything between them becomes one count.
    const head = events[0]!;
    const earliest = events[1]!;
    const tail = events.slice(-3);
    const hiddenCount = events.length - 2 - tail.length;

    const collapsed: ProgressionStep = {
        state: "collapsed",
        label: null,
        value: `+${hiddenCount} ${hiddenCount === 1 ? "movement" : "movements"}`,
        detail: null,
        note: null,
    };

    return { steps: [head, earliest, collapsed, ...tail], hiddenCount };
}
