/**
 * Assignment Timeline V1 — pure day chronology over concurrent assignments.
 *
 * Reusable across Assignment Detail, and later Household / Workspace / Staff.
 * Does not invent hours: segments without arrive/depart still appear in
 * weekday order with an "hours not set" note.
 */

import type { Assignment } from "@/lib/scheduling/projection/schedulingProjectionTypes";
import {
    formatCompactScheduleEffective,
    formatCompactScheduleHours,
    formatCompactScheduleWeekdays,
} from "@/lib/scheduling/projection/projectCompactScheduleForIdentity";

export type AssignmentTimelineSegment = {
    assignmentId: string;
    label: string;
    isPrimary: boolean;
    subjectType: "child" | "staff";
    startTime: string | null;
    endTime: string | null;
    startLabel: string | null;
    endLabel: string | null;
    roomName: string | null;
    patternLabel: string | null;
    note: string | null;
    overlapsPrevious: boolean;
    /** Quiet gap after previous segment (minutes), when both have hours and no overlap. */
    gapAfterPreviousMinutes: number | null;
    /** Assignment effective window starts after asOf (future commitment on this day pattern). */
    isFuture: boolean;
};

export type AssignmentTimelineModel = {
    weekday: number;
    weekdayLabel: string;
    segments: AssignmentTimelineSegment[];
    hasHours: boolean;
    summary: string;
    /** Count of gaps between timed segments on this day. */
    gapCount: number;
    /** Count of future-effective segments. */
    futureCount: number;
};

const WEEKDAY_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function displayLabel(a: Assignment): string {
    return a.assignmentType.label?.trim() || a.patternLabel?.trim() || a.room.name?.trim() || "Assignment";
}

function timeToMinutes(t: string | null): number | null {
    if (!t) return null;
    const [hh, mm] = t.split(":").map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    return hh * 60 + mm;
}

function rangesOverlap(
    aStart: string | null,
    aEnd: string | null,
    bStart: string | null,
    bEnd: string | null
): boolean {
    const as = timeToMinutes(aStart);
    const ae = timeToMinutes(aEnd);
    const bs = timeToMinutes(bStart);
    const be = timeToMinutes(bEnd);
    if (as == null || ae == null || bs == null || be == null) return false;
    return as < be && bs < ae;
}

function gapMinutes(
    prevEnd: string | null,
    nextStart: string | null,
    overlaps: boolean
): number | null {
    if (overlaps) return null;
    const pe = timeToMinutes(prevEnd);
    const ns = timeToMinutes(nextStart);
    if (pe == null || ns == null) return null;
    const gap = ns - pe;
    return gap > 0 ? gap : null;
}

function formatGapNote(minutes: number): string {
    if (minutes >= 60) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return m > 0 ? `${h}h ${m}m gap` : `${h}h gap`;
    }
    return `${minutes}m gap`;
}

/**
 * Build a chronological timeline for one weekday from concurrent assignments.
 * Assignments that do not include the weekday are omitted.
 * `asOfYmd` (YYYY-MM-DD) marks future-effective segments; defaults to UTC today.
 */
export function buildAssignmentTimelineForWeekday(
    assignments: Assignment[],
    weekday: number,
    asOfYmd?: string
): AssignmentTimelineModel {
    const asOf =
        asOfYmd?.slice(0, 10) ||
        new Date().toISOString().slice(0, 10);
    const onDay = assignments.filter((a) => a.weekdays.includes(weekday));
    const sorted = [...onDay].sort((a, b) => {
        const at = a.arriveTime ?? "99:99";
        const bt = b.arriveTime ?? "99:99";
        if (at !== bt) return at.localeCompare(bt);
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        return displayLabel(a).localeCompare(displayLabel(b));
    });

    const segments: AssignmentTimelineSegment[] = [];
    for (let i = 0; i < sorted.length; i++) {
        const a = sorted[i]!;
        const prev = i > 0 ? sorted[i - 1]! : null;
        const overlapsPrevious = prev
            ? rangesOverlap(prev.arriveTime, prev.departTime, a.arriveTime, a.departTime)
            : false;
        const gapAfterPreviousMinutes = prev
            ? gapMinutes(prev.departTime, a.arriveTime, overlapsPrevious)
            : null;
        const hours = formatCompactScheduleHours(a.arriveTime, a.departTime);
        const isFuture = Boolean(a.effectiveFrom && a.effectiveFrom.slice(0, 10) > asOf);
        const notes: string[] = [];
        if (overlapsPrevious) notes.push("Overlaps the previous assignment");
        else if (gapAfterPreviousMinutes != null) notes.push(formatGapNote(gapAfterPreviousMinutes));
        if (!hours) notes.push("Hours not set on this assignment");
        if (isFuture) notes.push(`Starts ${a.effectiveFrom.slice(0, 10)}`);
        segments.push({
            assignmentId: a.id,
            label: displayLabel(a),
            isPrimary: a.isPrimary,
            subjectType: a.subjectType,
            startTime: a.arriveTime,
            endTime: a.departTime,
            startLabel: a.arriveTime ? formatCompactScheduleHours(a.arriveTime, null) : null,
            endLabel: a.departTime ? formatCompactScheduleHours(null, a.departTime) : null,
            roomName: a.room.name,
            patternLabel: a.patternLabel,
            note: notes.length ? notes.join(" · ") : null,
            overlapsPrevious,
            gapAfterPreviousMinutes,
            isFuture,
        });
    }

    const hasHours = segments.some((s) => s.startTime && s.endTime);
    const gapCount = segments.filter((s) => s.gapAfterPreviousMinutes != null).length;
    const futureCount = segments.filter((s) => s.isFuture).length;
    const dayLabel = WEEKDAY_FULL[weekday] ?? `Day ${weekday}`;
    const bits: string[] = [];
    if (segments.length === 0) bits.push(`No assignments on ${dayLabel}`);
    else if (segments.length === 1) bits.push(`1 assignment on ${dayLabel}`);
    else bits.push(`${segments.length} assignments on ${dayLabel}`);
    if (gapCount > 0) bits.push(`${gapCount} gap${gapCount === 1 ? "" : "s"}`);
    if (futureCount > 0) bits.push(`${futureCount} future`);
    const summary = bits.join(" · ");

    return {
        weekday,
        weekdayLabel: dayLabel,
        segments,
        hasHours,
        summary,
        gapCount,
        futureCount,
    };
}

/** Prefer today if it appears on any assignment; else first weekday with work. */
export function pickTimelineWeekday(
    assignments: Assignment[],
    todayWeekday: number
): number {
    if (assignments.some((a) => a.weekdays.includes(todayWeekday))) return todayWeekday;
    for (const d of [1, 2, 3, 4, 5, 6, 0]) {
        if (assignments.some((a) => a.weekdays.includes(d))) return d;
    }
    return todayWeekday;
}

/** Primary first, then secondary by type label then effective start. */
export function sortAssignmentsForDisplay(assignments: Assignment[]): Assignment[] {
    return [...assignments].sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        const al = displayLabel(a);
        const bl = displayLabel(b);
        if (al !== bl) return al.localeCompare(bl);
        return a.effectiveFrom.localeCompare(b.effectiveFrom);
    });
}

/** Relationship-only financial placeholder for list/detail (no pricing). */
export function assignmentFinancialPlaceholder(a: Assignment): string {
    if (a.billing.participation === "eligible") {
        return a.billing.label?.trim() || "Billing eligible";
    }
    return "—";
}

/** Scan line for one assignment: Room · Days · Effective · Time (type stays on the chip). */
export function assignmentSummaryLine(a: Assignment): string {
    const room = a.room.name?.trim() || null;
    const days = formatCompactScheduleWeekdays(a.weekdays);
    const hours = formatCompactScheduleHours(a.arriveTime, a.departTime);
    const effective = formatCompactScheduleEffective({
        effectiveFrom: a.effectiveFrom,
        effectiveTo: a.effectiveTo,
        openEnded: a.openEnded,
    });
    return [room, days, effective, hours].filter(Boolean).join(" · ");
}
