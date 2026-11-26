/**
 * Pure folding of the append-only staff presence stream into effective facts and
 * per-day state. No DB, no IO.
 *
 * The correction rules are the SAME rules the child attendance fold applies —
 * deliberately, because replay semantics must not fork between fact streams:
 *  - a correction or reversal supersedes its target (`corrects_event_id`)
 *  - a superseded event is not effective
 *  - a reversal is a tombstone: it voids its target and contributes nothing
 *  - a non-superseded original or correction is effective (corrections carry the
 *    restated values)
 *
 * The UI never interprets raw event history — this module owns it.
 */

import type { StaffPresenceEventRow } from "@/lib/staffPresence/staffPresenceVocabulary";

/** Events that represent current truth after applying corrections/reversals. */
export function effectiveStaffPresenceEvents(
    events: readonly StaffPresenceEventRow[]
): StaffPresenceEventRow[] {
    const supersededIds = new Set<string>();
    for (const e of events) {
        if ((e.entry_type === "correction" || e.entry_type === "reversal") && e.corrects_event_id) {
            supersededIds.add(e.corrects_event_id);
        }
    }
    return events.filter((e) => !supersededIds.has(e.id) && e.entry_type !== "reversal");
}

/** Effective operational state for one person on one service date. */
export type StaffPresenceDayState = {
    personId: string;
    employmentId: string;
    serviceDate: string;
    /** True when an effective presence-asserting fact exists. */
    present: boolean;
    /** True when an effective absence fact was authored. */
    absent: boolean;
    firstCheckInAt: string | null;
    lastCheckOutAt: string | null;
    /** Checked in and not yet checked out. */
    onSite: boolean;
    /** Actual room from the latest presence-asserting fact — NOT the scheduled room. */
    currentRoomLocationId: string | null;
    roomsObserved: string[];
    siteLocationId: string | null;
    /** Effective fact a correction would target (the latest presence-asserting one). */
    latestFactId: string | null;
};

function dayKey(personId: string, serviceDate: string): string {
    return `${personId}::${serviceDate}`;
}

export function summarizeStaffPresenceByDay(
    events: readonly StaffPresenceEventRow[]
): StaffPresenceDayState[] {
    const effective = effectiveStaffPresenceEvents(events);
    const byDay = new Map<string, StaffPresenceEventRow[]>();
    for (const e of effective) {
        const k = dayKey(e.person_id, e.service_date);
        const list = byDay.get(k);
        if (list) list.push(e);
        else byDay.set(k, [e]);
    }

    const out: StaffPresenceDayState[] = [];
    for (const list of byDay.values()) {
        const sorted = list.slice().sort((a, b) => a.event_at.localeCompare(b.event_at));
        const first = sorted[0];

        const presenceKinds = sorted.filter(
            (e) => e.event_kind === "check_in" || e.event_kind === "present"
        );
        const checkIns = sorted.filter((e) => e.event_kind === "check_in");
        const checkOuts = sorted.filter((e) => e.event_kind === "check_out");
        const absences = sorted.filter((e) => e.event_kind === "absence");

        const rooms: string[] = [];
        for (const e of sorted) {
            if (e.room_location_id && !rooms.includes(e.room_location_id)) rooms.push(e.room_location_id);
        }

        const lastPresence = presenceKinds[presenceKinds.length - 1] ?? null;
        const firstCheckInAt = checkIns[0]?.event_at ?? null;
        const lastCheckOutAt = checkOuts[checkOuts.length - 1]?.event_at ?? null;

        out.push({
            personId: first.person_id,
            employmentId: first.employment_id,
            serviceDate: first.service_date,
            present: presenceKinds.length > 0,
            absent: absences.length > 0 && presenceKinds.length === 0,
            firstCheckInAt,
            lastCheckOutAt,
            onSite:
                presenceKinds.length > 0 &&
                (lastCheckOutAt == null ||
                    (firstCheckInAt != null && lastCheckOutAt < (lastPresence?.event_at ?? ""))),
            currentRoomLocationId: lastPresence?.room_location_id ?? null,
            roomsObserved: rooms,
            siteLocationId: first.site_location_id,
            latestFactId: (lastPresence ?? sorted[sorted.length - 1] ?? null)?.id ?? null,
        });
    }
    return out;
}
