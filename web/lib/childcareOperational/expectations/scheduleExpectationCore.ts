/**
 * Pure derivation primitives for Schedule-derived Expectations (L3).
 *
 * Expectations are DERIVED, never persisted as system-of-record. These functions
 * take already-fetched operational rows (committed L2 truth) plus config and
 * compute expected attendance / occupancy / staffing deterministically.
 *
 * Pure functions only — no DB, no IO.
 */

import {
    assertValidIsoDate,
    compareIsoDates,
    ISO_DATE_RE,
} from "@/lib/childcareOperational/effectiveDating";
import { type RatioTier } from "@/lib/childcareOperational/config/ratioRules";
// Staffing resolves through the canonical Ratio surface (Operational Calculation
// truth runtime), not the raw tier primitive — single source of truth. Parity is
// guaranteed for single-room tier lists and gated by canonicalRatioParity.test.ts.
import { resolveRequiredStaffForChildren } from "@/lib/childcareOperational/capacity/resolveRatio";

export type OperationalAgreementInput = {
    id: string;
    customer_member_id: string;
    site_location_id: string;
    start_date: string | null;
    end_date: string | null;
    status: string;
};

export type OperationalPlacementInput = {
    enrollment_agreement_id: string;
    room_location_id: string | null;
    program_category_id: string | null;
    start_date: string;
    end_date: string | null;
    status: string;
};

export type OperationalAssignmentInput = {
    /** The Assignment's own id — the authority its hours hang from. */
    id: string;
    enrollment_agreement_id: string;
    schedule_pattern_id: string;
    start_date: string;
    end_date: string | null;
    status: string;
};

export type SchedulePatternInput = {
    id: string;
    weekdays: number[];
    schedule_type_key: string;
};

/**
 * A Proposed (planning-only) operational assignment — carries its own room/program
 * directly (no `child_placements` join; proposed rows have no enrollment agreement).
 * Never counted as attendance/staffing truth — surfaced only as a separate
 * "planned" signal alongside committed occupancy.
 */
export type OperationalProposedAssignmentInput = {
    /** The Assignment's own id — the authority its hours hang from. */
    id: string;
    customer_member_id: string;
    site_location_id: string | null;
    room_location_id: string | null;
    program_category_id: string | null;
    schedule_pattern_id: string;
    start_date: string;
    end_date: string | null;
    status: string;
};

export type ExpectedAttendanceEntry = {
    date: string;
    weekday: number;
    agreementId: string;
    customerMemberId: string;
    siteLocationId: string;
    roomLocationId: string | null;
    programCategoryId: string | null;
    /** The Assignment this expectation came from — the authority for its hours. */
    assignmentId: string;
    /** Recurrence template only. Hours live on the Assignment, not here. */
    schedulePatternId: string;
    scheduleTypeKey: string;
};

export type ExpectedOccupancyEntry = {
    roomLocationId: string;
    date: string;
    childCount: number;
};

/** Planned (proposed) attendance for a room·date — a distinct, non-authoritative signal. */
export type PlannedAttendanceEntry = {
    date: string;
    weekday: number;
    customerMemberId: string;
    siteLocationId: string | null;
    roomLocationId: string | null;
    programCategoryId: string | null;
    /** The Assignment this expectation came from — the authority for its hours. */
    assignmentId: string;
    /** Recurrence template only. Hours live on the Assignment, not here. */
    schedulePatternId: string;
    scheduleTypeKey: string;
};

/** Planned (proposed) occupancy for a room·date — never merged with committed occupancy. */
export type PlannedOccupancyEntry = {
    roomLocationId: string;
    date: string;
    childCount: number;
};

export type ExpectedStaffingEntry = {
    roomLocationId: string;
    date: string;
    childCount: number;
    requiredStaff: number;
    exceedsDefinedTiers: boolean;
};

const OPERATIONAL_STATUSES = new Set(["planned", "active", "ending"]);
/**
 * Statuses whose dated window is a fact about what applied (V7 Package 1 / audit E2).
 *
 * A supersession marks the prior row `superseded` at once and closes it the day before its successor
 * starts — so between a future-dated edit and its start date the child's CURRENT schedule is a
 * `superseded` row. Reading live statuses only lost it, and the child disappeared from expected
 * attendance until the change began. The same window rule `deriveHomerooms` uses decides here.
 * `ended` (archive) keeps its "ends now" meaning and is not dated.
 */
export const DATED_ROW_STATUSES = new Set(["planned", "active", "ending", "superseded"]);
const AGREEMENT_OPERATIONAL_STATUSES = new Set(["pending_start", "active", "ending"]);

function isWithin(dateYmd: string, start: string | null | undefined, end: string | null | undefined): boolean {
    if (!start) return false;
    if (compareIsoDates(dateYmd, start) < 0) return false;
    if (end != null && compareIsoDates(dateYmd, end) > 0) return false;
    return true;
}

/** Weekday for a YYYY-MM-DD date (0=Sunday..6=Saturday), matching schedule_patterns. */
export function weekdayOf(dateYmd: string): number {
    assertValidIsoDate(dateYmd, "dateYmd");
    const m = ISO_DATE_RE.exec(dateYmd.trim())!;
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
}

/** Inclusive list of YYYY-MM-DD dates from start to end. */
export function enumerateDates(startYmd: string, endYmd: string): string[] {
    assertValidIsoDate(startYmd, "startYmd");
    assertValidIsoDate(endYmd, "endYmd");
    if (compareIsoDates(startYmd, endYmd) > 0) return [];

    const out: string[] = [];
    const m = ISO_DATE_RE.exec(startYmd.trim())!;
    const cursor = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    const endM = ISO_DATE_RE.exec(endYmd.trim())!;
    const end = Date.UTC(Number(endM[1]), Number(endM[2]) - 1, Number(endM[3]));

    while (cursor.getTime() <= end) {
        const yy = cursor.getUTCFullYear();
        const mm = String(cursor.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(cursor.getUTCDate()).padStart(2, "0");
        out.push(`${yy}-${mm}-${dd}`);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return out;
}

type DatedRow = { enrollment_agreement_id: string; status: string; start_date: string; end_date: string | null };

/** Whether a row's window is a fact at all. A superseded row without an end has no knowable window. */
function isDated(row: DatedRow): boolean {
    return DATED_ROW_STATUSES.has(row.status) && !(row.status === "superseded" && !row.end_date);
}

function groupDatedByAgreement<T extends DatedRow>(rows: readonly T[]): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const row of rows) {
        if (!isDated(row)) continue;
        const list = map.get(row.enrollment_agreement_id) ?? [];
        list.push(row);
        map.set(row.enrollment_agreement_id, list);
    }
    return map;
}

/**
 * THE row effective on `date` — at most one, so a supersession can neither leave a gap nor count a
 * child twice. Supersession windows do not overlap by construction (the prior closes the day before
 * its successor); should stored rows ever overlap, a live row beats a superseded one, then the later
 * start wins.
 */
export function rowEffectiveOn<T extends DatedRow>(rows: readonly T[] | undefined, date: string): T | null {
    let pick: T | null = null;
    for (const row of rows ?? []) {
        if (!isDated(row) || !isWithin(date, row.start_date, row.end_date)) continue;
        if (!pick) { pick = row; continue; }
        const live = OPERATIONAL_STATUSES.has(row.status), pickLive = OPERATIONAL_STATUSES.has(pick.status);
        if (live !== pickLive ? live : compareIsoDates(row.start_date, pick.start_date) > 0) pick = row;
    }
    return pick;
}

export type ExpandExpectedAttendanceInput = {
    dateStart: string;
    dateEnd: string;
    agreements: readonly OperationalAgreementInput[];
    placements: readonly OperationalPlacementInput[];
    assignments: readonly OperationalAssignmentInput[];
    patternsById: ReadonlyMap<string, SchedulePatternInput>;
    /** An assignment's own weekdays (Assignment Time) — they win over its pattern's. */
    weekdaysByAssignmentId?: ReadonlyMap<string, readonly number[]>;
};

/** The days a row recurs: its own Assignment Time when it has one, else its pattern's. */
function recurringWeekdays(
    assignmentId: string,
    pattern: SchedulePatternInput,
    own: ReadonlyMap<string, readonly number[]> | undefined,
): readonly number[] {
    return own?.get(assignmentId) ?? pattern.weekdays ?? [];
}

/**
 * Expected attendance per child per date: the schedule assignment effective ON that date x its
 * pattern weekdays x the placement effective on that date (room/program). Date-true: across a
 * supersession the prior row answers through its end and the successor from its start — never both,
 * never neither. No room is attributed when no placement covers the date (surfaced as a warning by
 * the assembler).
 */
export function expandExpectedAttendance(
    input: ExpandExpectedAttendanceInput
): ExpectedAttendanceEntry[] {
    const placementsByAgreement = groupDatedByAgreement(input.placements);
    const assignmentsByAgreement = groupDatedByAgreement(input.assignments);
    const dates = enumerateDates(input.dateStart, input.dateEnd);
    const entries: ExpectedAttendanceEntry[] = [];

    for (const agreement of input.agreements) {
        if (!AGREEMENT_OPERATIONAL_STATUSES.has(agreement.status)) continue;
        const rows = assignmentsByAgreement.get(agreement.id);
        if (!rows) continue;

        for (const date of dates) {
            if (!isWithin(date, agreement.start_date, agreement.end_date)) continue;
            const assignment = rowEffectiveOn(rows, date);
            if (!assignment) continue;
            const pattern = input.patternsById.get(assignment.schedule_pattern_id);
            if (!pattern) continue;
            const weekday = weekdayOf(date);
            if (!recurringWeekdays(assignment.id, pattern, input.weekdaysByAssignmentId).includes(weekday)) continue;

            const placement = rowEffectiveOn(placementsByAgreement.get(agreement.id), date);
            const placementCovers = placement != null;

            entries.push({
                date,
                weekday,
                agreementId: agreement.id,
                customerMemberId: agreement.customer_member_id,
                siteLocationId: agreement.site_location_id,
                roomLocationId: placementCovers ? placement!.room_location_id : null,
                programCategoryId: placementCovers ? placement!.program_category_id : null,
                assignmentId: assignment.id,
                schedulePatternId: pattern.id,
                scheduleTypeKey: pattern.schedule_type_key,
            });
        }
    }

    return entries;
}

/** Shared room·date tally — entries without a room are skipped. */
function tallyByRoomDate(
    entries: readonly { roomLocationId: string | null; date: string }[]
): { roomLocationId: string; date: string; childCount: number }[] {
    const counts = new Map<string, { roomLocationId: string; date: string; childCount: number }>();
    for (const e of entries) {
        if (!e.roomLocationId) continue;
        const key = `${e.roomLocationId}::${e.date}`;
        const existing = counts.get(key);
        if (existing) {
            existing.childCount += 1;
        } else {
            counts.set(key, { roomLocationId: e.roomLocationId, date: e.date, childCount: 1 });
        }
    }
    return [...counts.values()].sort(
        (a, b) => a.roomLocationId.localeCompare(b.roomLocationId) || a.date.localeCompare(b.date)
    );
}

/** Aggregate expected occupancy by room x date (entries without a room are skipped). */
export function aggregateExpectedOccupancyByRoomDate(
    entries: readonly ExpectedAttendanceEntry[]
): ExpectedOccupancyEntry[] {
    return tallyByRoomDate(entries);
}

export type ExpandPlannedAttendanceInput = {
    dateStart: string;
    dateEnd: string;
    proposedAssignments: readonly OperationalProposedAssignmentInput[];
    patternsById: ReadonlyMap<string, SchedulePatternInput>;
    weekdaysByAssignmentId?: ReadonlyMap<string, readonly number[]>;
};

/**
 * Planned attendance per child per date, from Proposed (planning-only) assignments:
 * pattern weekdays x each proposed row's own effective dates and room/program (no
 * placement/agreement join — proposed rows carry their room directly). Never
 * combined with `expandExpectedAttendance` — planning is a distinct, non-authoritative
 * signal.
 */
export function expandPlannedAttendance(
    input: ExpandPlannedAttendanceInput
): PlannedAttendanceEntry[] {
    const dates = enumerateDates(input.dateStart, input.dateEnd);
    const entries: PlannedAttendanceEntry[] = [];

    for (const a of input.proposedAssignments) {
        if (!OPERATIONAL_STATUSES.has(a.status)) continue;
        const pattern = input.patternsById.get(a.schedule_pattern_id);
        if (!pattern) continue;
        const weekdays = new Set(recurringWeekdays(a.id, pattern, input.weekdaysByAssignmentId));

        for (const date of dates) {
            if (!isWithin(date, a.start_date, a.end_date)) continue;
            const weekday = weekdayOf(date);
            if (!weekdays.has(weekday)) continue;

            entries.push({
                date,
                weekday,
                customerMemberId: a.customer_member_id,
                siteLocationId: a.site_location_id,
                roomLocationId: a.room_location_id,
                programCategoryId: a.program_category_id,
                assignmentId: a.id,
                schedulePatternId: pattern.id,
                scheduleTypeKey: pattern.schedule_type_key,
            });
        }
    }

    return entries;
}

/** Aggregate planned occupancy by room x date (entries without a room are skipped). */
export function aggregatePlannedOccupancyByRoomDate(
    entries: readonly PlannedAttendanceEntry[]
): PlannedOccupancyEntry[] {
    return tallyByRoomDate(entries);
}

/**
 * Expected staffing requirement per room x date from occupancy and a tier
 * resolver. `resolveTiers` returns the applicable ratio tiers for that room+date
 * (empty when no ratio rule applies).
 */
export function computeExpectedStaffingByRoomDate(
    occupancy: readonly ExpectedOccupancyEntry[],
    resolveTiers: (roomLocationId: string, date: string) => readonly RatioTier[]
): ExpectedStaffingEntry[] {
    return occupancy.map((o) => {
        const { requiredStaff, exceedsDefinedTiers } = resolveRequiredStaffForChildren(
            resolveTiers(o.roomLocationId, o.date),
            o.childCount
        );
        return {
            roomLocationId: o.roomLocationId,
            date: o.date,
            childCount: o.childCount,
            requiredStaff,
            exceedsDefinedTiers,
        };
    });
}
