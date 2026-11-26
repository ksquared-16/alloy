/**
 * The ONE answer to "does this location operate on this local date, and when?"
 *
 * Pure. Given the ledger rows a location's calendar can be made of, it resolves
 * each lineage through the ratified fold (`resolveEffectiveExpectation`, never a
 * copy of it), reads what the effective act says, and combines the entries that
 * apply into one day. Tours, Attendance and the operator calendar all ask this
 * function, so none of them can disagree with another about a closure.
 *
 * ── TWO VOCABULARIES, ONE ANSWER ──
 *
 *   location.operating_calendar        calendar entries: org or site scope, local
 *                                      dates in the location's zone, any effect
 *   attendance.service_day_exception   Attendance's existing day closures of a
 *                                      site or a room, unchanged
 *
 * Attendance's rows are read through Attendance's OWN relevance function and at
 * Attendance's OWN coordinate (`serviceDayAsOf`, the UTC start of the service
 * date), so a closure an operator recorded "on the 25th" reads here exactly as
 * the roster has always read it — the 25th — and its stored meaning is not
 * reinterpreted. A room closure is reported for the room and never closes the
 * site.
 *
 * ── PRECEDENCE, EXPLICITLY ──
 *
 *   explicit location entry  →  organization default  →  ordinary schedule
 *
 * If any location-scope entry with an operational effect applies on a date, the
 * organization's operational entries for that date are OVERRIDDEN (reported, not
 * applied). Otherwise the organization's apply. Otherwise the calendar says
 * nothing and the ordinary schedule stands. Creation order and query order never
 * decide anything: within one scope the combination is a fixed rule —
 *
 *   any full-day closure            → closed
 *   modified hours                  → the intersection of all of them
 *   partial closures                → removed from whatever remains
 *   open as usual                   → no constraint
 *
 * — and contradictions inside one scope (closed AND open as usual; two different
 * modified hours) resolve to the more restrictive reading AND are returned as
 * conflicts, so an operator sees them instead of a silent winner.
 *
 * A lineage the fold cannot resolve (an unratified transition) makes the date
 * `unresolved`. Consumers that offer availability treat that as closed: the
 * ledger could not say the location is open.
 */

import { resolveEffectiveExpectation } from "@/lib/operationalExpectations/resolver/resolveEffectiveExpectation";
import type { ExpectationQueryRow } from "@/lib/operationalExpectations/query/effectiveExpectationsForWindow";
import { primaryExpectationSubjectId } from "@/lib/operationalExpectations/query/expectationSubjectRef";
import {
    ATTENDANCE_EXPECTATION_PURPOSE,
    ATTENDANCE_SUBJECT_KINDS,
    serviceDayAsOf,
    serviceDayExpectationRelevance,
} from "@/lib/childcareOperational/attendance/serviceDayExpectations";
import {
    effectForPredicate,
    OPERATING_CALENDAR_PURPOSE,
    OPERATING_CALENDAR_SUBJECT_KINDS,
    wallMinutes,
    type OperatingCalendarDesignation,
    type OperatingCalendarEffect,
    type OperatingCalendarParams,
} from "@/lib/operatingCalendar/operatingCalendarVocabulary";
import {
    addCalendarDays,
    calendarDatesBetween,
    localDateOf,
    localMidnight,
    localNoon,
    wallInstant,
} from "@/lib/operatingCalendar/operatingCalendarTime";

export type CalendarEntryScope = "organization" | "location" | "room";
export type CalendarEntrySource = "calendar" | "attendance";

/** One entry as it applies on one date. */
export type CalendarDayEntry = {
    lineageId: string;
    expectationId: string;
    scope: CalendarEntryScope;
    source: CalendarEntrySource;
    effect: OperatingCalendarEffect;
    name: string;
    designation: OperatingCalendarDesignation | null;
    reasonKey: string | null;
    startTime: string | null;
    endTime: string | null;
    /** For a room closure: the room. */
    roomId: string | null;
};

export type MinuteInterval = { start: number; end: number };

export type ResolvedCalendarDay = {
    date: string;
    status: "open" | "modified" | "closed" | "unresolved";
    /**
     * Wall-clock intervals (minutes after local midnight) the location operates.
     * `null` means the calendar imposes nothing and the ordinary schedule stands.
     * An empty list means not operating at all.
     */
    openIntervals: MinuteInterval[] | null;
    /** True only when a full-day closure governs (not when partial closures happen to cover the day). */
    closedAllDay: boolean;
    governingScope: "location" | "organization" | null;
    /** Entries that decided the day. */
    applied: CalendarDayEntry[];
    /** Organization entries a location entry overrode on this date. */
    overridden: CalendarDayEntry[];
    /** Named days with no operational effect. Never change operation. */
    designations: CalendarDayEntry[];
    /** Room closures on this date: the room is not operating; the site is unaffected. */
    roomClosures: CalendarDayEntry[];
    conflicts: string[];
    unresolvedLineageIds: string[];
};

export type OperatingCalendarResolutionInput = {
    orgId: string;
    /** The site whose calendar this is. */
    siteId: string;
    /** The site's IANA zone. */
    timezone: string;
    fromDate: string;
    toDate: string;
    rows: readonly ExpectationQueryRow[];
    ratifiedExpectationIds?: ReadonlySet<string>;
};

const DAY = 24 * 60;

function conditionOf(row: ExpectationQueryRow | undefined): Record<string, unknown> {
    const c = row?.condition;
    return c && typeof c === "object" && !Array.isArray(c) ? (c as Record<string, unknown>) : {};
}

function purposeOf(row: ExpectationQueryRow): string {
    const c = conditionOf(row);
    const t = c.typeKey ?? c.type_key;
    return typeof t === "string" ? t : "";
}

function predicateOf(row: ExpectationQueryRow | undefined): string {
    const c = conditionOf(row);
    const p = c.predicateShape ?? c.predicate_shape;
    return typeof p === "string" ? p : "";
}

function calendarParamsOf(row: ExpectationQueryRow | undefined): Partial<OperatingCalendarParams> {
    const p = conditionOf(row).params;
    return p && typeof p === "object" && !Array.isArray(p) ? (p as Partial<OperatingCalendarParams>) : {};
}

function attendanceReasonOf(row: ExpectationQueryRow | undefined): string | null {
    const p = conditionOf(row).params as Record<string, unknown> | undefined;
    const r = p?.reason_key;
    return typeof r === "string" && r.trim() ? r.trim() : null;
}

function rootOf(row: ExpectationQueryRow): string {
    return row.lineage_root_id ?? row.id;
}

function byAuthored(a: ExpectationQueryRow, b: ExpectationQueryRow): number {
    const d = Date.parse(a.authored_at) - Date.parse(b.authored_at);
    return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Intersection of two sorted, non-overlapping interval lists. */
function intersect(a: MinuteInterval[], b: MinuteInterval[]): MinuteInterval[] {
    const out: MinuteInterval[] = [];
    for (const x of a) {
        for (const y of b) {
            const start = Math.max(x.start, y.start);
            const end = Math.min(x.end, y.end);
            if (end > start) out.push({ start, end });
        }
    }
    return out.sort((p, q) => p.start - q.start);
}

function subtract(base: MinuteInterval[], cut: MinuteInterval): MinuteInterval[] {
    const out: MinuteInterval[] = [];
    for (const x of base) {
        if (cut.end <= x.start || cut.start >= x.end) {
            out.push(x);
            continue;
        }
        if (cut.start > x.start) out.push({ start: x.start, end: cut.start });
        if (cut.end < x.end) out.push({ start: cut.end, end: x.end });
    }
    return out;
}

function intervalOf(entry: CalendarDayEntry): MinuteInterval | null {
    if (!entry.startTime || !entry.endTime) return null;
    const start = wallMinutes(entry.startTime);
    const end = wallMinutes(entry.endTime, { allowEndOfDay: true });
    if (start == null || end == null || end <= start) return null;
    return { start, end };
}

function sameIntervals(a: MinuteInterval[], b: MinuteInterval[]): boolean {
    return a.length === b.length && a.every((x, i) => x.start === b[i]!.start && x.end === b[i]!.end);
}

/** Combine the operational entries of ONE scope into a day. Pure, order-independent. */
function combineScope(entries: CalendarDayEntry[]): {
    status: ResolvedCalendarDay["status"];
    openIntervals: MinuteInterval[] | null;
    closedAllDay: boolean;
    conflicts: string[];
} {
    const conflicts: string[] = [];
    const closed = entries.filter((e) => e.effect === "closed");
    const modified = entries.filter((e) => e.effect === "modified_hours");
    const partial = entries.filter((e) => e.effect === "partial_closure");
    const openAsUsual = entries.filter((e) => e.effect === "open_as_usual");

    if (closed.length > 0) {
        if (openAsUsual.length > 0) {
            conflicts.push("A closure and an “open as usual” entry both apply; the closure is used.");
        }
        if (modified.length > 0) {
            conflicts.push("A closure and modified hours both apply; the closure is used.");
        }
        return { status: "closed", openIntervals: [], closedAllDay: true, conflicts };
    }

    let base: MinuteInterval[] = [{ start: 0, end: DAY }];
    let constrained = false;
    if (modified.length > 0) {
        constrained = true;
        const sets = modified.map((e) => intervalOf(e)).filter((x): x is MinuteInterval => x != null);
        for (const s of sets) base = intersect(base, [s]);
        if (sets.length > 1 && !sets.every((s) => sameIntervals([s], [sets[0]!]))) {
            conflicts.push("Different modified hours apply; only the hours they share are used.");
        }
        if (openAsUsual.length > 0) {
            conflicts.push("Modified hours and an “open as usual” entry both apply; the modified hours are used.");
        }
    }
    for (const e of partial) {
        const cut = intervalOf(e);
        if (!cut) continue;
        constrained = true;
        base = subtract(base, cut);
    }

    if (!constrained) return { status: "open", openIntervals: null, closedAllDay: false, conflicts };
    if (base.length === 0) return { status: "closed", openIntervals: [], closedAllDay: false, conflicts };
    return { status: "modified", openIntervals: base, closedAllDay: false, conflicts };
}

type Lineage = { root: string; rows: ExpectationQueryRow[]; purpose: string };

/**
 * Resolve a site's calendar for every local date in `fromDate..toDate`.
 */
export function resolveOperatingCalendar(input: OperatingCalendarResolutionInput): Map<string, ResolvedCalendarDay> {
    const lineages = new Map<string, Lineage>();
    for (const row of input.rows) {
        if (row.org_id !== input.orgId) continue;
        const root = rootOf(row);
        const l = lineages.get(root);
        if (l) l.rows.push(row);
        else lineages.set(root, { root, rows: [row], purpose: "" });
    }
    for (const l of lineages.values()) {
        l.rows.sort(byAuthored);
        // A lineage keeps its purpose; read it from the root act.
        l.purpose = purposeOf(l.rows[0]!);
    }

    const byId = new Map(input.rows.map((r) => [r.id, r]));
    const days = new Map<string, ResolvedCalendarDay>();

    for (const date of calendarDatesBetween(input.fromDate, input.toDate)) {
        const location: CalendarDayEntry[] = [];
        const organization: CalendarDayEntry[] = [];
        const designations: CalendarDayEntry[] = [];
        const roomClosures: CalendarDayEntry[] = [];
        const unresolved: string[] = [];

        for (const l of lineages.values()) {
            if (l.purpose === OPERATING_CALENDAR_PURPOSE) {
                const latest = l.rows[l.rows.length - 1]!;
                const zone = String(calendarParamsOf(latest).timezone || input.timezone);
                const resolution = resolveEffectiveExpectation(l.rows, {
                    orgId: input.orgId,
                    lineageRootId: l.root,
                    asOf: { validTime: localNoon(date, zone) },
                    ratifiedExpectationIds: input.ratifiedExpectationIds,
                });
                if (resolution.kind === "unsupported_transition") {
                    unresolved.push(l.root);
                    continue;
                }
                if (resolution.kind !== "resolved") continue;
                const row = byId.get(resolution.effective.effectiveExpectationId);
                const effect = effectForPredicate(predicateOf(row));
                if (effect == null || effect === "withdrawn") continue;
                const params = calendarParamsOf(row);
                // The entry's own dates decide the day; the frame can be wider (see commands).
                if (!params.from_date || !params.to_date || date < params.from_date || date > params.to_date) continue;

                const subjectId = row ? primaryExpectationSubjectId(row.subject_ref) : "";
                let scope: CalendarEntryScope;
                if (row?.subject_kind === OPERATING_CALENDAR_SUBJECT_KINDS.organization && subjectId === input.orgId) {
                    scope = "organization";
                } else if (row?.subject_kind === OPERATING_CALENDAR_SUBJECT_KINDS.location && subjectId === input.siteId) {
                    scope = "location";
                } else {
                    continue; // another site's entry, never this one's
                }
                const entry: CalendarDayEntry = {
                    lineageId: l.root,
                    expectationId: row!.id,
                    scope,
                    source: "calendar",
                    effect,
                    name: String(params.name ?? ""),
                    designation: (params.designation ?? null) as OperatingCalendarDesignation | null,
                    reasonKey: params.reason_key ?? null,
                    startTime: params.start_time ?? null,
                    endTime: params.end_time ?? null,
                    roomId: null,
                };
                if (effect === "none") designations.push(entry);
                else (scope === "organization" ? organization : location).push(entry);
                continue;
            }

            if (l.purpose === ATTENDANCE_EXPECTATION_PURPOSE) {
                const resolution = resolveEffectiveExpectation(l.rows, {
                    orgId: input.orgId,
                    lineageRootId: l.root,
                    asOf: serviceDayAsOf(date),
                    ratifiedExpectationIds: input.ratifiedExpectationIds,
                });
                const rootRow = l.rows[0]!;
                const isSite =
                    rootRow.subject_kind === ATTENDANCE_SUBJECT_KINDS.site &&
                    primaryExpectationSubjectId(rootRow.subject_ref) === input.siteId;
                if (resolution.kind === "unsupported_transition") {
                    // Only a SITE lineage can make the site's day undeterminable.
                    if (isSite) unresolved.push(l.root);
                    continue;
                }
                if (resolution.kind !== "resolved") continue;
                const row = byId.get(resolution.effective.effectiveExpectationId);
                if (!row) continue;
                const relevance = serviceDayExpectationRelevance({
                    subjectKind: row.subject_kind,
                    modality: row.modality,
                    condition: conditionOf(row),
                    standing: row.standing,
                });
                if (!relevance.relevant || relevance.kind !== "grain_closed") continue;
                const subjectId = primaryExpectationSubjectId(row.subject_ref);
                const base = {
                    lineageId: l.root,
                    expectationId: row.id,
                    source: "attendance" as const,
                    effect: "closed" as const,
                    name: "Closed (recorded in Attendance)",
                    designation: "closure" as const,
                    reasonKey: attendanceReasonOf(row),
                    startTime: null,
                    endTime: null,
                };
                if (row.subject_kind === ATTENDANCE_SUBJECT_KINDS.site && subjectId === input.siteId) {
                    location.push({ ...base, scope: "location", roomId: null });
                } else if (row.subject_kind === ATTENDANCE_SUBJECT_KINDS.operationalGroup) {
                    roomClosures.push({ ...base, scope: "room", roomId: subjectId });
                }
            }
        }

        const governing = location.length > 0 ? location : organization;
        const governingScope = location.length > 0 ? "location" : organization.length > 0 ? "organization" : null;
        const combined = combineScope(governing);
        const sortEntries = (list: CalendarDayEntry[]) =>
            list.sort((a, b) => (a.lineageId < b.lineageId ? -1 : a.lineageId > b.lineageId ? 1 : 0));

        days.set(date, {
            date,
            status: unresolved.length > 0 ? "unresolved" : combined.status,
            openIntervals: unresolved.length > 0 ? [] : combined.openIntervals,
            closedAllDay: unresolved.length > 0 ? false : combined.closedAllDay,
            governingScope,
            applied: sortEntries([...governing]),
            overridden: location.length > 0 ? sortEntries([...organization]) : [],
            designations: sortEntries(designations),
            roomClosures: sortEntries(roomClosures),
            conflicts: combined.conflicts,
            unresolvedLineageIds: unresolved.sort(),
        });
    }
    return days;
}

/**
 * Is the half-open instant interval [startUtc, endUtc) inside the location's
 * operating time? A day the calendar says nothing about is open. A date outside
 * the resolved range is NOT assumed open — the caller resolved too little.
 */
export function isInstantIntervalOperating(
    days: ReadonlyMap<string, ResolvedCalendarDay>,
    timezone: string,
    startUtc: Date,
    endUtc: Date,
): boolean {
    if (!(endUtc > startUtc)) return false;
    let date = localDateOf(startUtc, timezone);
    const lastDate = localDateOf(new Date(endUtc.getTime() - 1), timezone);
    for (;;) {
        const day = days.get(date);
        if (!day) return false;
        if (day.status === "unresolved" || day.status === "closed") return false;
        if (day.openIntervals != null) {
            const dayStart = localMidnight(date, timezone).getTime();
            const dayEnd = localMidnight(addCalendarDays(date, 1), timezone).getTime();
            const s = Math.max(startUtc.getTime(), dayStart);
            const e = Math.min(endUtc.getTime(), dayEnd);
            // Intervals are WALL-CLOCK minutes. On a DST day wall time and elapsed
            // time differ by an hour, so each bound becomes an instant on that date.
            const fits = day.openIntervals.some((iv) => {
                const ivStart = wallInstantMs(date, iv.start, timezone);
                const ivEnd = wallInstantMs(date, iv.end, timezone);
                return ivStart <= s && e <= ivEnd;
            });
            if (!fits) return false;
        }
        if (date >= lastDate) return true;
        date = addCalendarDays(date, 1);
    }
}

function wallInstantMs(date: string, minutes: number, timezone: string): number {
    return wallInstant(date, minutes, timezone).getTime();
}
