/**
 * The operator's list of calendar entries for a site: one row per lineage, as it
 * stands now, with where it comes from and what the caller may do with it.
 *
 * Pure. Built from the same rows the resolver reads, so the list can never show
 * an entry the resolver does not know about, or hide one it applies.
 */

import type { ExpectationQueryRow } from "@/lib/operationalExpectations/query/effectiveExpectationsForWindow";
import { primaryExpectationSubjectId } from "@/lib/operationalExpectations/query/expectationSubjectRef";
import {
    ATTENDANCE_EXPECTATION_PURPOSE,
    ATTENDANCE_SUBJECT_KINDS,
    SERVICE_DAY_PREDICATES,
} from "@/lib/childcareOperational/attendance/serviceDayExpectations";
import {
    effectForPredicate,
    OPERATING_CALENDAR_PURPOSE,
    OPERATING_CALENDAR_SUBJECT_KINDS,
    type OperatingCalendarParams,
} from "@/lib/operatingCalendar/operatingCalendarVocabulary";
import { addCalendarDays } from "@/lib/operatingCalendar/operatingCalendarTime";

export type CalendarEntryView = {
    /** The latest act's id — what an edit or withdrawal names. */
    entryId: string;
    lineageId: string;
    source: "calendar" | "attendance";
    scope: "organization" | "location" | "room";
    /** For a room closure recorded in Attendance. */
    roomId: string | null;
    status: "active" | "withdrawn";
    name: string;
    designation: string | null;
    effect: string;
    fromDate: string;
    toDate: string;
    startTime: string | null;
    endTime: string | null;
    timezone: string | null;
    reasonKey: string | null;
    note: string | null;
    /** How many acts the lineage holds: 1 = never changed. */
    revisions: number;
    lastChangedAt: string;
    authoredByUserId: string | null;
};

function cond(row: ExpectationQueryRow): Record<string, unknown> {
    return (row.condition ?? {}) as Record<string, unknown>;
}

function purposeOf(row: ExpectationQueryRow): string {
    const c = cond(row);
    return String(c.typeKey ?? c.type_key ?? "");
}

function predicateOf(row: ExpectationQueryRow): string {
    const c = cond(row);
    return String(c.predicateShape ?? c.predicate_shape ?? "");
}

function paramsOf(row: ExpectationQueryRow): Record<string, unknown> {
    const p = cond(row).params;
    return p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
}

function authorOf(row: ExpectationQueryRow): string | null {
    const k = String(row.authority_key ?? "");
    return k.startsWith("user:") ? k.slice(5) || null : null;
}

export function listCalendarEntries(input: {
    orgId: string;
    siteId: string;
    rows: readonly ExpectationQueryRow[];
}): CalendarEntryView[] {
    const lineages = new Map<string, ExpectationQueryRow[]>();
    for (const row of input.rows) {
        if (row.org_id !== input.orgId) continue;
        const root = row.lineage_root_id ?? row.id;
        const list = lineages.get(root);
        if (list) list.push(row);
        else lineages.set(root, [row]);
    }

    const out: CalendarEntryView[] = [];
    for (const [root, rows] of lineages) {
        rows.sort((a, b) => Date.parse(a.authored_at) - Date.parse(b.authored_at) || (a.id < b.id ? -1 : 1));
        const latest = rows[rows.length - 1]!;
        const subjectId = primaryExpectationSubjectId(latest.subject_ref);
        const purpose = purposeOf(rows[0]!);

        if (purpose === OPERATING_CALENDAR_PURPOSE) {
            const scope =
                latest.subject_kind === OPERATING_CALENDAR_SUBJECT_KINDS.organization && subjectId === input.orgId
                    ? "organization"
                    : latest.subject_kind === OPERATING_CALENDAR_SUBJECT_KINDS.location && subjectId === input.siteId
                      ? "location"
                      : null;
            if (!scope) continue;
            const p = paramsOf(latest) as Partial<OperatingCalendarParams>;
            const withdrawn = effectForPredicate(predicateOf(latest)) === "withdrawn";
            out.push({
                entryId: latest.id,
                lineageId: root,
                source: "calendar",
                scope,
                roomId: null,
                status: withdrawn ? "withdrawn" : "active",
                name: String(p.name ?? ""),
                designation: p.designation ?? null,
                effect: String(p.effect ?? "none"),
                fromDate: String(p.from_date ?? ""),
                toDate: String(p.to_date ?? ""),
                startTime: p.start_time ?? null,
                endTime: p.end_time ?? null,
                timezone: p.timezone ?? null,
                reasonKey: p.reason_key ?? null,
                note: p.note ?? null,
                revisions: rows.length,
                lastChangedAt: latest.authored_at,
                authoredByUserId: authorOf(latest),
            });
            continue;
        }

        if (purpose === ATTENDANCE_EXPECTATION_PURPOSE) {
            const isSite = latest.subject_kind === ATTENDANCE_SUBJECT_KINDS.site && subjectId === input.siteId;
            const isRoom = latest.subject_kind === ATTENDANCE_SUBJECT_KINDS.operationalGroup;
            if (!isSite && !isRoom) continue;
            const predicate = predicateOf(latest);
            if (predicate !== SERVICE_DAY_PREDICATES.grainClosed && predicate !== SERVICE_DAY_PREDICATES.grainOpen) continue;
            const reason = paramsOf(latest).reason_key;
            // Attendance's day windows are UTC-bounded service dates; the date is the
            // service date the operator chose, which is what is shown.
            const fromDate = latest.valid_from.slice(0, 10);
            const toDate = latest.valid_to ? addCalendarDays(latest.valid_to.slice(0, 10), -1) : fromDate;
            out.push({
                entryId: latest.id,
                lineageId: root,
                source: "attendance",
                scope: isSite ? "location" : "room",
                roomId: isRoom ? subjectId : null,
                status: predicate === SERVICE_DAY_PREDICATES.grainClosed ? "active" : "withdrawn",
                name: "Closed (recorded in Attendance)",
                designation: "closure",
                effect: "closed",
                fromDate,
                toDate: toDate < fromDate ? fromDate : toDate,
                startTime: null,
                endTime: null,
                timezone: null,
                reasonKey: typeof reason === "string" ? reason : null,
                note: null,
                revisions: rows.length,
                lastChangedAt: latest.authored_at,
                authoredByUserId: authorOf(latest),
            });
        }
    }
    return out.sort((a, b) => (a.fromDate < b.fromDate ? -1 : a.fromDate > b.fromDate ? 1 : a.lineageId < b.lineageId ? -1 : 1));
}
