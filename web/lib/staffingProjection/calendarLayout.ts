/**
 * Geometry for the operating day — and ONLY geometry.
 *
 * The Calendar draws the projection; it does not recompute it. Everything here
 * turns canonical segments into positions and summaries a lane can render, and
 * nothing here decides whether a room is staffed. The one verdict this module
 * produces is a lane's overall state, and it produces it by calling the certified
 * roll-up rather than by inventing a second rule — a surface that decided "worst
 * wins" for itself would be a second staffing engine wearing CSS.
 *
 * ── A DISPLAY SCALE IS NOT A TRUTH SCALE ──
 *
 * The strip is laid out on a continuous minute scale so a fifteen-minute gap is
 * visibly narrower than a four-hour block. It is NOT snapped to half-hours.
 * Rounding segment boundaries to a rendering grid would put business state on a
 * scale the projection never used, and the first thing it would hide is exactly
 * the short handover gap the slice exists to surface.
 */

import {
    rollUpStaffingSufficiency,
    type StaffingSufficiency,
} from "@/lib/scheduling/supply/staffingSufficiency";
import { minutesOf, type Hhmm } from "@/lib/staffingProjection/staffingSegments";
import type { StaffingProjectionSegment } from "@/lib/staffingProjection/staffingProjectionTypes";

export type OperatingWindow = { start: Hhmm; end: Hhmm };

/**
 * The stretch of clock the day actually covers.
 *
 * Derived from the segments rather than from site hours: a day whose facts run
 * 07:00–18:00 should fill the strip, and one that runs 08:30–16:00 should not be
 * drawn as two hours of empty gutter on either side.
 */
export function operatingWindow(segments: readonly StaffingProjectionSegment[]): OperatingWindow | null {
    if (segments.length === 0) return null;
    let start = segments[0].start;
    let end = segments[0].end;
    for (const s of segments) {
        if (s.start < start) start = s.start;
        if (s.end > end) end = s.end;
    }
    return { start, end };
}

/** Where a segment sits in the strip, as percentages of the operating window. */
export function percentSpan(
    window: OperatingWindow,
    segment: { start: Hhmm; end: Hhmm }
): { leftPct: number; widthPct: number } {
    const total = minutesOf(window.end) - minutesOf(window.start);
    if (total <= 0) return { leftPct: 0, widthPct: 100 };
    const left = ((minutesOf(segment.start) - minutesOf(window.start)) / total) * 100;
    const width = ((minutesOf(segment.end) - minutesOf(segment.start)) / total) * 100;
    return { leftPct: Math.max(0, left), widthPct: Math.max(0, width) };
}

/** Hour ticks inside the window, for a scale an operator can read against. */
export function hourTicks(window: OperatingWindow): Hhmm[] {
    const out: Hhmm[] = [];
    const first = Math.ceil(minutesOf(window.start) / 60);
    const last = Math.floor(minutesOf(window.end) / 60);
    for (let h = first; h <= last; h += 1) {
        out.push(`${String(h).padStart(2, "0")}:00`);
    }
    return out;
}

export type CalendarLane = {
    roomLocationId: string | null;
    roomName: string | null;
    segments: StaffingProjectionSegment[];
    /** The certified roll-up of this lane's segment verdicts. */
    state: StaffingSufficiency;
    /** Peaks, for the at-a-glance line. Presentation only. */
    expectedChildrenPeak: number;
    actualChildrenPeak: number | null;
    requiredStaffPeak: number | null;
    plannedStaffPeak: number;
    actualStaffPeak: number | null;
    /** Segments an operator can act on, in clock order. */
    gapSegments: StaffingProjectionSegment[];
    /** True when any segment could not resolve a requirement. */
    hasUnknown: boolean;
};

const LANE_ORDER: Record<StaffingSufficiency, number> = {
    short: 0,
    unknown: 1,
    idle: 2,
    sufficient: 3,
};

/**
 * Group a day's segments into room lanes.
 *
 * The site lane sorts last and is labelled rather than left blank: staff planned
 * at the site with no room is a real and common allocation, and a nameless lane
 * reads as a rendering bug.
 */
export function buildCalendarLanes(segments: readonly StaffingProjectionSegment[]): CalendarLane[] {
    const byRoom = new Map<string, StaffingProjectionSegment[]>();
    for (const s of segments) {
        const key = s.roomLocationId ?? "__site__";
        byRoom.set(key, [...(byRoom.get(key) ?? []), s]);
    }

    const lanes: CalendarLane[] = [];
    for (const [key, list] of byRoom) {
        const ordered = list.slice().sort((a, b) => a.start.localeCompare(b.start));
        const actualsKnown = ordered.some((s) => s.actualStaff != null);
        lanes.push({
            roomLocationId: key === "__site__" ? null : key,
            roomName: ordered[0]?.roomName ?? null,
            segments: ordered,
            state: rollUpStaffingSufficiency(ordered.map((s) => s.plannedState)),
            expectedChildrenPeak: Math.max(0, ...ordered.map((s) => s.expectedChildCount)),
            actualChildrenPeak: actualsKnown
                ? Math.max(0, ...ordered.map((s) => s.actualChildCount ?? 0))
                : null,
            requiredStaffPeak: ordered.every((s) => s.requiredStaff == null)
                ? null
                : Math.max(0, ...ordered.map((s) => s.requiredStaff ?? 0)),
            plannedStaffPeak: Math.max(0, ...ordered.map((s) => s.plannedStaff.length)),
            actualStaffPeak: actualsKnown
                ? Math.max(0, ...ordered.map((s) => s.actualStaff?.length ?? 0))
                : null,
            gapSegments: ordered.filter((s) => s.plannedState === "short"),
            hasUnknown: ordered.some((s) => s.requiredStaff == null || s.plannedState === "unknown"),
        });
    }

    return lanes.sort((a, b) => {
        // Rooms needing attention first, the site lane always last.
        if ((a.roomLocationId === null) !== (b.roomLocationId === null)) {
            return a.roomLocationId === null ? 1 : -1;
        }
        const byState = LANE_ORDER[a.state] - LANE_ORDER[b.state];
        if (byState !== 0) return byState;
        return (a.roomName ?? "").localeCompare(b.roomName ?? "");
    });
}

/**
 * The context a gap hands to the Coverage command.
 *
 * Everything the operator would otherwise retype, and nothing they would have to
 * verify: site, room, date and the exact interval come from the segment that is
 * short, and the shortfall comes from the projection's own arithmetic.
 */
export type GapCommandContext = {
    siteLocationId: string;
    roomLocationId: string | null;
    date: string;
    startTime: Hhmm;
    endTime: Hhmm;
    shortfall: number;
};

export function gapCommandContext(segment: StaffingProjectionSegment): GapCommandContext | null {
    if (segment.plannedState !== "short" || segment.shortfall == null) return null;
    return {
        siteLocationId: segment.siteLocationId,
        roomLocationId: segment.roomLocationId,
        date: segment.date,
        startTime: segment.start,
        endTime: segment.end,
        shortfall: segment.shortfall,
    };
}

/**
 * Staff the operator could plan into a gap, from canonical facts only.
 *
 * Available in that segment and planned nowhere in it — the projection already
 * answers both, so this is a read of its answer rather than a candidate engine.
 * Nobody is ranked and nobody is silently excluded; Readiness is advisory and
 * does not appear here at all, because removing someone from a list is not an
 * advisory act.
 */
export function candidatesForGap(
    segment: StaffingProjectionSegment,
    allSegmentsInSameInterval: readonly StaffingProjectionSegment[]
): { employmentId: string; personId: string; displayName: string }[] {
    const plannedSomewhere = new Set(
        allSegmentsInSameInterval
            .filter((s) => s.start === segment.start && s.end === segment.end)
            .flatMap((s) => s.plannedStaff.map((p) => p.employmentId))
    );
    return segment.availableStaff
        .filter((a) => !plannedSomewhere.has(a.employmentId))
        .map((a) => ({ employmentId: a.employmentId, personId: a.personId, displayName: a.displayName }));
}
