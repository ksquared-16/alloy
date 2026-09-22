/**
 * THE PROJECTION — one canonical answer to "is this room staffed, right now-ish,
 * and if not why not".
 *
 * It composes; it does not author. Every fact here belongs to an authority that
 * already exists and is never written back to:
 *
 *   expected children   Schedule Expectations, with hours from the child's own
 *                       Assignment (Slice 1), not from a shared pattern
 *   actual children     Attendance
 *   baseline staff      Assignment + Assignment Time + staffing_participation
 *                       (Slice 2)
 *   available staff     Availability
 *   planned staff       Coverage specialising the baseline place (Slice 3)
 *   actual staff        Presence
 *   requirement         the configured ratio model
 *
 * ── PLANNED PLACE HAS ONE RULE ──
 *
 * Coverage wins for the interval it names; otherwise the Assignment's room
 * stands. That single rule covers both shapes the operator distinguishes: a
 * fixed-room person stays in their room until Coverage moves them, and a
 * site-level or float person stays site-level until Coverage puts them in a room.
 * An uncovered float interval stays site-level — the projection does not invent a
 * room for someone nobody placed.
 *
 * Because the rule picks exactly one place per employment per segment, one
 * employment is counted once. A site-level baseline plus a room Coverage is one
 * person in that room, never one in the room and another at the site.
 *
 * ── PURE ──
 *
 * No database and no clock. Everything arrives resolved so the semantics can be
 * tested against fixtures rather than against a seeded environment, and so the
 * fetch layer can change its query plan without touching the meaning.
 */

import {
    resolveRequiredStaffDemand,
    resolveStaffingSufficiency,
    type StaffingSufficiency,
} from "@/lib/scheduling/supply/staffingSufficiency";
import {
    covers,
    deriveBoundaries,
    deriveSegments,
    mergeIntervals,
    type TimeInterval,
} from "@/lib/staffingProjection/staffingSegments";
import type {
    ChildRef,
    PlannedStaffRef,
    StaffRef,
    StaffingExplanation,
    StaffingExplanationFact,
    StaffingProjectionDay,
    StaffingProjectionSegment,
    StaffingProjectionUnknown,
} from "@/lib/staffingProjection/staffingProjectionTypes";

/** A child expected on this date, with the hours their own Assignment gives. */
export type ProjectionChildExpected = {
    customerMemberId: string;
    agreementId: string;
    assignmentId: string;
    roomLocationId: string | null;
    /** Empty when the Assignment records no hours for this weekday. */
    intervals: TimeInterval[];
    hoursKnown: boolean;
};

/** A child observed by Attendance, placed on the wall clock of the org's day. */
export type ProjectionChildActual = {
    customerMemberId: string;
    roomLocationId: string | null;
    interval: TimeInterval;
};

/** One employed person and everything the four authorities say about their day. */
export type ProjectionStaffInput = {
    employmentId: string;
    personId: string;
    displayName: string;
    assignmentId: string | null;
    /** Null means the Assignment placed them at the site, not in a room. */
    baselineRoomLocationId: string | null;
    baselineIntervals: TimeInterval[];
    baselineHoursKnown: boolean;
    availabilityIntervals: TimeInterval[];
    coverage: { roomLocationId: string | null; interval: TimeInterval }[];
    /** Null when Presence observed nothing for this person on this date. */
    presence: { roomLocationId: string | null; interval: TimeInterval }[] | null;
};

export type BuildStaffingProjectionDayInput = {
    orgId: string;
    siteLocationId: string;
    date: string;
    children: ProjectionChildExpected[];
    childActuals: ProjectionChildActual[];
    staff: ProjectionStaffInput[];
    /** The configured ratio model, asked per room for a given occupancy. */
    requiredStaffFor: (
        roomLocationId: string | null,
        childCount: number
    ) => { requiredStaff: number | null; exceedsDefinedTiers: boolean };
    roomNameById: ReadonlyMap<string, string | null>;
    /**
     * False for a day nothing has been observed about yet. Actual counts of zero
     * then mean "not observed", and the projection says so instead of reporting
     * an empty room as idle.
     */
    actualsObserved: boolean;
    /** Carried through from the fetch layer: inputs it could not read truthfully. */
    unknowns?: StaffingProjectionUnknown[];
};

const ROOM_SITE_KEY = "__site__";

function roomKey(roomLocationId: string | null): string {
    return roomLocationId ?? ROOM_SITE_KEY;
}

function byName(a: { displayName: string }, b: { displayName: string }): number {
    return a.displayName.localeCompare(b.displayName);
}

function names(list: readonly { displayName: string }[]): string[] {
    return list.map((s) => s.displayName);
}

/** "Alex", "Alex and Sam", "Alex, Sam and Jordan" — one rendering, everywhere. */
function joinNames(list: readonly string[]): string {
    if (list.length === 0) return "";
    if (list.length === 1) return list[0];
    return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

function lineFor(fact: StaffingExplanationFact): string {
    switch (fact.code) {
        case "expected_children":
            return `Expected children: ${fact.count}`;
        case "expected_children_unknown_hours":
            return fact.count === 1
                ? "1 expected child has no recorded hours and is counted in no segment"
                : `${fact.count} expected children have no recorded hours and are counted in no segment`;
        case "actual_children":
            return `Actual children: ${fact.count}`;
        case "required_staff":
            return `Required staff: ${fact.count}`;
        case "required_unresolved":
            return "Required staff is unknown — no configured ratio tier covers this occupancy";
        case "baseline_staff":
            return `Baseline staff: ${joinNames(fact.names)}`;
        case "planned_staff":
            return `Planned staff: ${fact.names.length > 0 ? joinNames(fact.names) : "none"}`;
        case "available_not_planned":
            return `${joinNames(fact.names)} ${fact.names.length === 1 ? "is" : "are"} available but not planned anywhere during this interval`;
        case "coverage_specialized":
            return `Coverage places ${joinNames(fact.names)} here for this interval`;
        case "planned_not_present":
            return `${joinNames(fact.names)} ${fact.names.length === 1 ? "is" : "are"} planned here but not observed present`;
        case "present_not_planned":
            return `${joinNames(fact.names)} ${fact.names.length === 1 ? "was" : "were"} observed here but not planned here`;
        case "shortfall":
            return `Short ${fact.count} staff`;
        case "no_demand":
            return "No children expected in this interval";
        case "actuals_not_observed":
            return "Nothing has been observed for this date yet";
    }
}

function explain(facts: StaffingExplanationFact[]): StaffingExplanation {
    return { facts, lines: facts.map(lineFor) };
}

/**
 * Where this employment is planned during this segment, or null.
 *
 * Coverage first — that is the whole point of Coverage — and the Assignment
 * otherwise. Nothing else can place a person, so a person with neither is simply
 * not planned, which is a different fact from being planned at the site.
 */
function plannedPlaceFor(
    staff: ProjectionStaffInput,
    segment: TimeInterval
): { roomLocationId: string | null; source: "assignment" | "coverage" } | null {
    const covering = staff.coverage.find((c) => covers(c.interval, segment));
    if (covering) return { roomLocationId: covering.roomLocationId, source: "coverage" };
    if (staff.baselineIntervals.some((i) => covers(i, segment))) {
        return { roomLocationId: staff.baselineRoomLocationId, source: "assignment" };
    }
    return null;
}

export function buildStaffingProjectionDay(
    input: BuildStaffingProjectionDayInput
): StaffingProjectionDay {
    const { orgId, siteLocationId, date, children, childActuals, staff, requiredStaffFor } = input;
    const unknowns: StaffingProjectionUnknown[] = [...(input.unknowns ?? [])];

    // Every timed fact contributes a cut. Availability and Presence are included
    // deliberately: a segment that spanned the moment someone became available
    // could not answer whether they were available in it.
    const all: TimeInterval[] = [];
    for (const c of children) all.push(...c.intervals);
    for (const a of childActuals) all.push(a.interval);
    for (const s of staff) {
        all.push(...s.baselineIntervals, ...s.availabilityIntervals);
        for (const c of s.coverage) all.push(c.interval);
        for (const p of s.presence ?? []) all.push(p.interval);
    }

    const boundaries = deriveBoundaries(all);
    const segments = deriveSegments(all);

    for (const c of children) {
        if (!c.hoursKnown) {
            unknowns.push({
                code: "child_hours_unknown",
                assignmentId: c.assignmentId,
                customerMemberId: c.customerMemberId,
            });
        }
    }
    for (const s of staff) {
        if (!s.baselineHoursKnown && s.assignmentId) {
            unknowns.push({
                code: "assignment_hours_unknown",
                assignmentId: s.assignmentId,
                personId: s.personId,
            });
        }
    }
    if (!input.actualsObserved) unknowns.push({ code: "actuals_not_observed", date });

    // Rooms the day touches: anywhere a child is expected or observed, anywhere a
    // person is based, covered or observed. The site bucket appears only when
    // something is actually site-level.
    const roomIds = new Set<string | null>();
    for (const c of children) roomIds.add(c.roomLocationId);
    for (const a of childActuals) roomIds.add(a.roomLocationId);
    for (const s of staff) {
        roomIds.add(s.baselineRoomLocationId);
        for (const c of s.coverage) roomIds.add(c.roomLocationId);
        for (const p of s.presence ?? []) roomIds.add(p.roomLocationId);
    }

    const out: StaffingProjectionSegment[] = [];

    for (const segment of segments) {
        // One pass over people per segment, so an employment resolves to exactly
        // one place and cannot appear in two rooms' lists.
        const plannedByRoom = new Map<string, PlannedStaffRef[]>();
        const plannedAnywhere = new Set<string>();
        const baselineByRoom = new Map<string, StaffRef[]>();
        const actualByRoom = new Map<string, StaffRef[]>();
        const availablePool: StaffRef[] = [];

        for (const s of staff) {
            const ref: StaffRef = {
                employmentId: s.employmentId,
                personId: s.personId,
                displayName: s.displayName,
            };

            if (s.baselineIntervals.some((i) => covers(i, segment))) {
                const k = roomKey(s.baselineRoomLocationId);
                baselineByRoom.set(k, [...(baselineByRoom.get(k) ?? []), ref]);
            }

            if (s.availabilityIntervals.some((i) => covers(i, segment))) availablePool.push(ref);

            const place = plannedPlaceFor(s, segment);
            if (place) {
                plannedAnywhere.add(s.employmentId);
                const k = roomKey(place.roomLocationId);
                const planned: PlannedStaffRef = {
                    ...ref,
                    source: place.source,
                    ...(place.source === "coverage"
                        ? { baselineRoomLocationId: s.baselineRoomLocationId }
                        : {}),
                };
                plannedByRoom.set(k, [...(plannedByRoom.get(k) ?? []), planned]);
            }

            for (const p of s.presence ?? []) {
                if (!covers(p.interval, segment)) continue;
                const k = roomKey(p.roomLocationId);
                const list = actualByRoom.get(k) ?? [];
                if (!list.some((x) => x.employmentId === s.employmentId)) {
                    actualByRoom.set(k, [...list, ref]);
                }
            }
        }

        const freeNames = availablePool
            .filter((a) => !plannedAnywhere.has(a.employmentId))
            .sort(byName);

        for (const roomLocationId of roomIds) {
            const k = roomKey(roomLocationId);

            const expected = children
                .filter((c) => c.roomLocationId === roomLocationId && c.intervals.some((i) => covers(i, segment)))
                .map<ChildRef>((c) => ({ customerMemberId: c.customerMemberId, agreementId: c.agreementId }));
            const unknownHours = children
                .filter((c) => c.roomLocationId === roomLocationId && !c.hoursKnown)
                .map<ChildRef>((c) => ({ customerMemberId: c.customerMemberId, agreementId: c.agreementId }));

            const actualChildIds = new Set(
                childActuals
                    .filter((a) => a.roomLocationId === roomLocationId && covers(a.interval, segment))
                    .map((a) => a.customerMemberId)
            );

            const baselineStaff = (baselineByRoom.get(k) ?? []).slice().sort(byName);
            const plannedStaff = (plannedByRoom.get(k) ?? []).slice().sort(byName);
            const actualStaff = input.actualsObserved ? (actualByRoom.get(k) ?? []).slice().sort(byName) : null;

            const expectedCount = expected.length;
            const ratio = requiredStaffFor(roomLocationId, expectedCount);
            const requiredStaff = resolveRequiredStaffDemand({
                requiredStaff: ratio.requiredStaff,
                exceedsDefinedTiers: ratio.exceedsDefinedTiers,
                childCount: expectedCount,
            });
            if (requiredStaff == null) unknowns.push({ code: "ratio_unresolved", roomLocationId });

            const actualCount = input.actualsObserved ? actualChildIds.size : null;
            const actualRatio =
                actualCount == null ? null : requiredStaffFor(roomLocationId, actualCount);
            const requiredStaffActual =
                actualRatio == null || actualCount == null
                    ? null
                    : resolveRequiredStaffDemand({
                          requiredStaff: actualRatio.requiredStaff,
                          exceedsDefinedTiers: actualRatio.exceedsDefinedTiers,
                          childCount: actualCount,
                      });

            const plannedState = resolveStaffingSufficiency({
                requiredStaff,
                scheduledStaffCount: plannedStaff.length,
            });
            const actualState: StaffingSufficiency = !input.actualsObserved
                ? "unknown"
                : resolveStaffingSufficiency({
                      requiredStaff: requiredStaffActual,
                      scheduledStaffCount: actualStaff?.length ?? null,
                  });

            const shortfall =
                requiredStaff == null ? null : Math.max(0, requiredStaff - plannedStaff.length);

            // A segment with nothing in it at all is not worth a row; a segment
            // with staff and no children is (that is an idle or over-staffed room,
            // and both are answers).
            if (
                expectedCount === 0 &&
                unknownHours.length === 0 &&
                baselineStaff.length === 0 &&
                plannedStaff.length === 0 &&
                (actualStaff?.length ?? 0) === 0 &&
                actualChildIds.size === 0
            ) {
                continue;
            }

            const plannedNotPresent =
                actualStaff == null
                    ? []
                    : plannedStaff.filter((p) => !actualStaff.some((a) => a.employmentId === p.employmentId));
            const presentNotPlanned =
                actualStaff == null
                    ? []
                    : actualStaff.filter((a) => !plannedStaff.some((p) => p.employmentId === a.employmentId));
            const specialized = plannedStaff.filter((p) => p.source === "coverage");

            const facts: StaffingExplanationFact[] = [];
            facts.push({ code: "expected_children", count: expectedCount });
            if (unknownHours.length > 0) {
                facts.push({ code: "expected_children_unknown_hours", count: unknownHours.length });
            }
            if (actualCount != null) facts.push({ code: "actual_children", count: actualCount });
            if (requiredStaff == null) {
                facts.push({ code: "required_unresolved", reason: "no_ratio_tier_covers_occupancy" });
            } else {
                facts.push({ code: "required_staff", count: requiredStaff });
            }
            if (baselineStaff.length > 0) facts.push({ code: "baseline_staff", names: names(baselineStaff) });
            facts.push({ code: "planned_staff", names: names(plannedStaff) });
            if (specialized.length > 0) {
                facts.push({ code: "coverage_specialized", names: names(specialized) });
            }
            if (plannedState === "short" && freeNames.length > 0) {
                facts.push({ code: "available_not_planned", names: names(freeNames) });
            }
            if (shortfall != null && shortfall > 0) facts.push({ code: "shortfall", count: shortfall });
            if (expectedCount === 0 && requiredStaff === 0) facts.push({ code: "no_demand" });
            if (plannedNotPresent.length > 0) {
                facts.push({ code: "planned_not_present", names: names(plannedNotPresent) });
            }
            if (presentNotPlanned.length > 0) {
                facts.push({ code: "present_not_planned", names: names(presentNotPlanned) });
            }
            if (!input.actualsObserved) facts.push({ code: "actuals_not_observed" });

            out.push({
                date,
                siteLocationId,
                roomLocationId,
                roomName: roomLocationId ? (roomNameOf(input.roomNameById, roomLocationId)) : null,
                start: segment.start,
                end: segment.end,
                expectedChildren: expected,
                expectedChildCount: expectedCount,
                expectedChildrenUnknownHours: unknownHours,
                actualChildCount: actualCount,
                baselineStaff,
                availableStaff: availablePool.slice().sort(byName),
                plannedStaff,
                actualStaff,
                requiredStaff,
                requiredStaffActual,
                plannedState,
                actualState,
                shortfall,
                explanation: explain(facts),
            });
        }
    }

    out.sort(
        (a, b) =>
            a.start.localeCompare(b.start) ||
            (a.roomLocationId ?? "").localeCompare(b.roomLocationId ?? "")
    );

    return {
        orgId,
        siteLocationId,
        date,
        boundaries,
        segments: out,
        unknowns,
        actualsObserved: input.actualsObserved,
    };
}

function roomNameOf(map: ReadonlyMap<string, string | null>, roomLocationId: string): string | null {
    return map.get(roomLocationId) ?? null;
}

/** Re-exported so consumers can state one person's day without the raw rows. */
export { mergeIntervals };
