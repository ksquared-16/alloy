/**
 * The roster's current-whereabouts adapter — ONE answer, from the certified fold.
 *
 * ── WHY THIS EXISTS ──
 *
 * Three different derivations of "where is this child now" had grown up:
 *
 *   1. `attendanceWhereabouts.whereaboutsAt` — Thread 2, chronological, certified,
 *      and consumed by nothing.
 *   2. `childAttendanceReadModel.deriveCurrentPresence` — chronological, correct,
 *      used by the Focus Panel.
 *   3. `buildCombinedRoster` — `roomsObserved[length - 1]`, which is the
 *      ALPHABETICALLY last room of a sorted set with no time in it, used by the
 *      Attendance Workspace.
 *
 * Two were right and the third was the one an operator looks at all day. A child
 * who ends the afternoon back on the playground was still shown in the classroom
 * she had left, because "Playground" sorts before "Toddler 2". An attendance
 * board that names the wrong room is worse than one that says nothing.
 *
 * This adapter makes the roster ask (1), so the Workspace and the Focus Panel
 * cannot disagree about a child's location. It adds no interpretation of its own:
 * it translates the fold's answer into the shape the roster row already had, and
 * that is deliberately all it does.
 *
 * It returns NO placement. Placement is committed intent and lives on the roster
 * row from the expectation side; whereabouts is observed fact. Keeping them in
 * separate fields is what stops a move from ever reading as a re-placement.
 */

import { whereaboutsAt } from "@/lib/childcareOperational/attendance/attendanceWhereabouts";
import type { ChildAttendanceEventRow } from "@/lib/childcareOperational/attendance/attendanceTypes";

/** Operator-facing presence state for a roster row. */
export type RosterWhereaboutsState = "present" | "checked_out" | "absent" | "not_arrived";

export type RosterWhereabouts = {
    state: RosterWhereaboutsState;
    /** The unit the child is in RIGHT NOW; null unless present. */
    locationId: string | null;
};

/**
 * Where this child is at `at`, from their own attendance facts.
 *
 * `events` must already be scoped to one child. Corrections and reversals are
 * honoured by the underlying fold, so a reversed move rewrites the answer rather
 * than leaving the child stranded in a room they were never in.
 */
export function resolveCurrentWhereabouts(
    events: readonly ChildAttendanceEventRow[],
    at: string
): RosterWhereabouts {
    const w = whereaboutsAt(events, at);
    if (!w) return { state: "not_arrived", locationId: null };

    // The fold's `present` is the only state that carries a location. Everything
    // else must clear it: a checked-out child is not "in" the room she left, and
    // showing her there is exactly the stale-location failure this replaces.
    if (w.state === "present") {
        return { state: "present", locationId: w.locationId };
    }
    // The fold calls departure `departed`; the roster row has always called it
    // `checked_out`. Translating here keeps the operator-facing vocabulary stable
    // without renaming a certified fact-layer state to suit a surface.
    if (w.state === "departed") return { state: "checked_out", locationId: null };
    if (w.state === "absent") return { state: "absent", locationId: null };
    return { state: "not_arrived", locationId: null };
}
