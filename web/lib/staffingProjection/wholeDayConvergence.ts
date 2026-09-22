/**
 * The bridge from the segment grid back to the whole-day answer.
 *
 * There must not be two staffing engines, and the way to avoid that is not to
 * rewrite every consumer in one slice — it is to make the whole-day answer a
 * REDUCTION of the segmented one, so the coarse number is derived from the fine
 * one rather than computed beside it.
 *
 * ── WHERE THE TWO CAN LEGITIMATELY DIFFER ──
 *
 * `buildStaffSupply` counts a person for a date on recurrence alone: the
 * Assignment covers the day and the pattern runs that weekday, hours or no hours.
 * The projection cannot place a person in any segment without hours, because a
 * segment is a claim about a time. So an Assignment with unknown hours is supply
 * to the old reading and appears nowhere in the new one.
 *
 * That difference is reported, never smoothed. `onlyInWholeDay` holding exactly
 * the unknown-hours people is the correct outcome and the thing to assert in a
 * parity test; the same list arriving unexplained is a regression.
 */

import type { StaffSupplyCell } from "@/lib/scheduling/supply/buildStaffSupply";
import type { StaffingProjectionDay } from "@/lib/staffingProjection/staffingProjectionTypes";

const SITE_KEY = "__site__";

function key(roomLocationId: string | null): string {
    return roomLocationId ?? SITE_KEY;
}

export type WholeDayStaffSupplyCell = {
    date: string;
    roomLocationId: string | null;
    /** Distinct people planned there at any point in the day. */
    personIds: string[];
    scheduledStaffCount: number;
};

/**
 * Reduce a day's segments to the whole-day shape existing consumers read.
 *
 * Planned place, not baseline: a person Coverage moved for the afternoon appears
 * in the room they are planned in, which is what a whole-day roster should have
 * said all along and could not, because it had no way to express the move.
 */
export function wholeDayFromProjection(day: StaffingProjectionDay): WholeDayStaffSupplyCell[] {
    const byRoom = new Map<string, { roomLocationId: string | null; personIds: Set<string> }>();
    for (const segment of day.segments) {
        const k = key(segment.roomLocationId);
        const entry = byRoom.get(k) ?? { roomLocationId: segment.roomLocationId, personIds: new Set<string>() };
        for (const p of segment.plannedStaff) entry.personIds.add(p.personId);
        byRoom.set(k, entry);
    }
    return [...byRoom.values()]
        .map((e) => ({
            date: day.date,
            roomLocationId: e.roomLocationId,
            personIds: [...e.personIds].sort(),
            scheduledStaffCount: e.personIds.size,
        }))
        .filter((c) => c.scheduledStaffCount > 0)
        .sort((a, b) => (a.roomLocationId ?? "").localeCompare(b.roomLocationId ?? ""));
}

export type WholeDayParity = {
    date: string;
    /** Rooms where both readings name the same people. */
    matchingRooms: string[];
    /** person ids the whole-day reading has and the projection does not. */
    onlyInWholeDay: { roomLocationId: string | null; personIds: string[] }[];
    /** person ids the projection has and the whole-day reading does not. */
    onlyInProjection: { roomLocationId: string | null; personIds: string[] }[];
};

/** Compare the two readings for one date. Empty differences mean exact parity. */
export function compareWholeDaySupply(
    supplyCells: readonly StaffSupplyCell[],
    projected: readonly WholeDayStaffSupplyCell[],
    date: string
): WholeDayParity {
    const legacy = new Map<string, Set<string>>();
    for (const cell of supplyCells) {
        if (cell.date !== date) continue;
        const k = key(cell.roomLocationId);
        const set = legacy.get(k) ?? new Set<string>();
        for (const s of cell.scheduledStaff) set.add(s.personId);
        legacy.set(k, set);
    }

    const next = new Map<string, Set<string>>();
    for (const cell of projected) {
        if (cell.date !== date) continue;
        next.set(key(cell.roomLocationId), new Set(cell.personIds));
    }

    const rooms = new Set<string>([...legacy.keys(), ...next.keys()]);
    const matchingRooms: string[] = [];
    const onlyInWholeDay: WholeDayParity["onlyInWholeDay"] = [];
    const onlyInProjection: WholeDayParity["onlyInProjection"] = [];

    for (const k of [...rooms].sort()) {
        const roomLocationId = k === SITE_KEY ? null : k;
        const a = legacy.get(k) ?? new Set<string>();
        const b = next.get(k) ?? new Set<string>();
        const missing = [...a].filter((p) => !b.has(p)).sort();
        const extra = [...b].filter((p) => !a.has(p)).sort();
        if (missing.length === 0 && extra.length === 0) {
            matchingRooms.push(k);
            continue;
        }
        if (missing.length > 0) onlyInWholeDay.push({ roomLocationId, personIds: missing });
        if (extra.length > 0) onlyInProjection.push({ roomLocationId, personIds: extra });
    }

    return { date, matchingRooms, onlyInWholeDay, onlyInProjection };
}
