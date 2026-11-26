/**
 * Point-in-time whereabouts — a deterministic fold over the append-only ledger.
 *
 * THE BUG THIS REPLACES
 *
 * `summarizeAttendanceByDay` answers "which rooms did this child appear in
 * today" and returns a SET. That is the right answer to that question and the
 * wrong answer to "where is this child now": a child who went Toddler 1 →
 * Playground → Toddler 2 appears in all three, so a consumer counting occupancy
 * from it counts one child three times. The facts are not wrong — the aggregate
 * is the wrong shape.
 *
 * A child is in exactly ONE place at a time. That is a property of children, not
 * of the query, so it is enforced here by construction: the fold walks the
 * effective facts in time order and keeps a single current location that each
 * event replaces. There is no set to over-count.
 *
 * NO SECOND SOURCE OF TRUTH. Nothing here is stored. There is no `current_room`
 * column and there must never be one — the ledger already knows, and a cached
 * copy would be a second thing to keep correct and a first thing to drift.
 * Corrections and reversals therefore reconstruct history for free: they change
 * which facts are effective, and the same fold run again yields the corrected
 * past.
 */

import {
    effectiveAttendanceEvents,
} from "@/lib/childcareOperational/attendance/attendanceFold";
import type { ChildAttendanceEventRow } from "@/lib/childcareOperational/attendance/attendanceTypes";

/** Where a child was at an instant. */
export type Whereabouts = {
    enrollmentAgreementId: string;
    customerMemberId: string;
    /** The unit the child was in, or null when not present (never arrived, or departed). */
    locationId: string | null;
    /** Presence state at the instant asked about. */
    state: "present" | "departed" | "absent" | "not_arrived";
    /** The fact that established this state. */
    asOfEventId: string | null;
    asOfEventAt: string | null;
};

/** One location's occupants at an instant. */
export type PointInTimeOccupancy = {
    locationId: string;
    at: string;
    occupants: string[];
    childCount: number;
};

type Positioned = {
    locationId: string | null;
    state: Whereabouts["state"];
    eventId: string;
    eventAt: string;
};

/**
 * The location an event places the child in, and the resulting state.
 *
 * `null` location with `present` is impossible by table CHECK (check_in and
 * present both require a room), so an unexpected shape yields the previous
 * position rather than a guess.
 */
function positionFor(event: ChildAttendanceEventRow): Positioned | null {
    const base = { eventId: event.id, eventAt: event.event_at };
    switch (event.event_kind) {
        case "check_in":
        case "present":
            return event.room_location_id
                ? { ...base, locationId: event.room_location_id, state: "present" }
                : null;
        case "room_transfer":
            return event.to_room_location_id
                ? { ...base, locationId: event.to_room_location_id, state: "present" }
                : null;
        case "check_out":
            // Departure ends presence. The room a child left is not where they are.
            return { ...base, locationId: null, state: "departed" };
        case "absence":
            return { ...base, locationId: null, state: "absent" };
        case "schedule_override":
            // Carries no whereabouts meaning; it changes expectation, not position.
            return null;
        default:
            return null;
    }
}

/** Chronological order, with event id as a stable tiebreak for identical instants. */
function byTime(a: ChildAttendanceEventRow, b: ChildAttendanceEventRow): number {
    return a.event_at.localeCompare(b.event_at) || a.id.localeCompare(b.id);
}

/**
 * Where one child was at `at` (inclusive), from that child's facts.
 *
 * Facts after `at` are ignored, which is what makes this a historical query
 * rather than a live one: asking about 09:00 tomorrow and asking about 09:00
 * today give the same answer forever, unless a correction changes the past.
 */
export function whereaboutsAt(
    events: readonly ChildAttendanceEventRow[],
    at: string
): Whereabouts | null {
    const effective = effectiveAttendanceEvents(events)
        .slice()
        .sort(byTime)
        .filter((e) => e.event_at <= at);

    if (effective.length === 0) {
        const any = events[0];
        if (!any) return null;
        return {
            enrollmentAgreementId: any.enrollment_agreement_id,
            customerMemberId: any.customer_member_id,
            locationId: null,
            state: "not_arrived",
            asOfEventId: null,
            asOfEventAt: null,
        };
    }

    // One position, replaced in order. A child cannot accumulate places.
    let position: Positioned | null = null;
    for (const event of effective) {
        const next = positionFor(event);
        if (next) position = next;
    }

    const last = effective[effective.length - 1];
    if (!position) {
        return {
            enrollmentAgreementId: last.enrollment_agreement_id,
            customerMemberId: last.customer_member_id,
            locationId: null,
            state: "not_arrived",
            asOfEventId: null,
            asOfEventAt: null,
        };
    }

    return {
        enrollmentAgreementId: last.enrollment_agreement_id,
        customerMemberId: last.customer_member_id,
        locationId: position.locationId,
        state: position.state,
        asOfEventId: position.eventId,
        asOfEventAt: position.eventAt,
    };
}

/**
 * Whereabouts for every child represented in `events`, at one instant.
 * Events may span many children; they are grouped by enrollment agreement.
 */
export function whereaboutsForAllAt(
    events: readonly ChildAttendanceEventRow[],
    at: string
): Whereabouts[] {
    const byAgreement = new Map<string, ChildAttendanceEventRow[]>();
    for (const e of events) {
        const list = byAgreement.get(e.enrollment_agreement_id) ?? [];
        list.push(e);
        byAgreement.set(e.enrollment_agreement_id, list);
    }

    const out: Whereabouts[] = [];
    for (const list of byAgreement.values()) {
        const w = whereaboutsAt(list, at);
        if (w) out.push(w);
    }
    return out.sort((a, b) => a.enrollmentAgreementId.localeCompare(b.enrollmentAgreementId));
}

/**
 * Occupancy per location at an instant.
 *
 * Because each child contributes exactly one location, the sum of all counts is
 * the number of present children — the invariant day-level aggregation breaks.
 */
export function occupancyAt(
    events: readonly ChildAttendanceEventRow[],
    at: string
): PointInTimeOccupancy[] {
    const present = whereaboutsForAllAt(events, at).filter(
        (w) => w.state === "present" && w.locationId != null
    );

    const byLocation = new Map<string, string[]>();
    for (const w of present) {
        const list = byLocation.get(w.locationId!) ?? [];
        list.push(w.customerMemberId);
        byLocation.set(w.locationId!, list);
    }

    return [...byLocation.entries()]
        .map(([locationId, occupants]) => ({
            locationId,
            at,
            occupants: occupants.slice().sort(),
            childCount: occupants.length,
        }))
        .sort((a, b) => a.locationId.localeCompare(b.locationId));
}

/**
 * Roll point-in-time occupancy up to containing physical spaces.
 *
 * Thread 1 topology: an operational group may sit inside a physical space, and
 * the space's real occupancy is the sum of its groups. `spaceByGroupId` comes
 * from the canonical room provider (`containingSpaceLocationId`), never from a
 * parent lookup here — resolving hierarchy is that provider's job, not this
 * fold's.
 *
 * A location with no containing space (a standalone classroom, a playground)
 * rolls up to itself, so callers get one total per physical location either way.
 */
export function occupancyByPhysicalSpaceAt(
    events: readonly ChildAttendanceEventRow[],
    at: string,
    spaceByGroupId: ReadonlyMap<string, string | null>
): PointInTimeOccupancy[] {
    const rolled = new Map<string, string[]>();

    for (const entry of occupancyAt(events, at)) {
        const target = spaceByGroupId.get(entry.locationId) ?? entry.locationId;
        const list = rolled.get(target) ?? [];
        list.push(...entry.occupants);
        rolled.set(target, list);
    }

    return [...rolled.entries()]
        .map(([locationId, occupants]) => ({
            locationId,
            at,
            occupants: occupants.slice().sort(),
            childCount: occupants.length,
        }))
        .sort((a, b) => a.locationId.localeCompare(b.locationId));
}
