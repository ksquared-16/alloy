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
    /**
     * The enrollment's own schedule (V7 S6). Absent reads as primary, so a caller that supplies only
     * the primary — the pre-S6 contract — is unchanged.
     */
    is_primary?: boolean;
    /** A qualifying secondary session's own space; a primary's room comes from its placement. */
    room_location_id?: string | null;
    /** The row this one replaced — a secondary's sessions over time form one lineage. */
    supersedes_assignment_id?: string | null;
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
    /**
     * The enrollment's own schedule, or a qualifying secondary session (V7 S6). A child may have
     * several entries on one date — one per session — so readers that need ONE expected room or
     * schedule per child·date take the primary entry (`primaryEntryFor`), and counts dedupe by child.
     */
    isPrimary: boolean;
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
 * An agreement's sessions over time (V7 S6): its primary lineage — every primary row, one effective
 * per date, exactly as before — and one lineage per qualifying secondary, keyed by the row its
 * replacements descend from (`supersedes_assignment_id`). Within a lineage `rowEffectiveOn` picks one
 * row per date, so a supersession never doubles a session; distinct lineages are distinct sessions.
 */
function sessionLineages<T extends OperationalAssignmentInput>(rows: readonly T[]): T[][] {
    const primaries = rows.filter((r) => r.is_primary !== false);
    const secondaries = rows.filter((r) => r.is_primary === false);
    const byId = new Map(secondaries.map((r) => [r.id, r]));
    const rootOf = (row: T): string => {
        let cur = row;
        const seen = new Set<string>();
        while (cur.supersedes_assignment_id && byId.has(cur.supersedes_assignment_id) && !seen.has(cur.id)) {
            seen.add(cur.id);
            cur = byId.get(cur.supersedes_assignment_id)!;
        }
        return cur.id;
    };
    const lineages = new Map<string, T[]>();
    for (const row of secondaries) {
        const root = rootOf(row);
        lineages.set(root, [...(lineages.get(root) ?? []), row]);
    }
    return [...(primaries.length ? [primaries] : []), ...lineages.values()];
}

/**
 * Expected attendance per child per date per session: for each session lineage, the row effective ON
 * that date x its own weekdays (Assignment Time, else pattern). The primary's room/program is the
 * placement effective on that date; a qualifying secondary session is expected in its own space (no
 * space → expected at the site with no room). Date-true: across a supersession the prior row answers
 * through its end and the successor from its start — never both, never neither. Which secondaries
 * qualify is the loader's decision (category `attendance_participation = 'expected'`, V7 S6).
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
        const lineages = sessionLineages(rows);

        for (const date of dates) {
            if (!isWithin(date, agreement.start_date, agreement.end_date)) continue;
            const weekday = weekdayOf(date);
            for (const lineage of lineages) {
                const assignment = rowEffectiveOn(lineage, date);
                if (!assignment) continue;
                const pattern = input.patternsById.get(assignment.schedule_pattern_id);
                if (!pattern) continue;
                if (!recurringWeekdays(assignment.id, pattern, input.weekdaysByAssignmentId).includes(weekday)) continue;

                const isPrimary = assignment.is_primary !== false;
                const placement = rowEffectiveOn(placementsByAgreement.get(agreement.id), date);
                entries.push({
                    date,
                    weekday,
                    agreementId: agreement.id,
                    customerMemberId: agreement.customer_member_id,
                    siteLocationId: agreement.site_location_id,
                    roomLocationId: isPrimary ? (placement?.room_location_id ?? null) : (assignment.room_location_id ?? null),
                    programCategoryId: placement?.program_category_id ?? null,
                    assignmentId: assignment.id,
                    schedulePatternId: pattern.id,
                    scheduleTypeKey: pattern.schedule_type_key,
                    isPrimary,
                });
            }
        }
    }

    return entries;
}

/**
 * THE one expectation per child·date for readers that need a single expected room or schedule (the
 * Attendance card's expected room, the days-a-week policy, population weights): the primary session,
 * else the earliest-listed session. Pure.
 */
export function primaryEntryFor<T extends { isPrimary?: boolean }>(entries: readonly T[]): T | null {
    return entries.find((e) => e.isPrimary !== false) ?? entries[0] ?? null;
}

/** Entries of a child on a date reduced to one per room (V7 S6: a child counts once per room per date). */
export function oneEntryPerChildRoomDate<T extends { customerMemberId?: string | null; roomLocationId: string | null; date: string }>(
    entries: readonly T[],
): T[] {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const e of entries) {
        const key = e.customerMemberId ? `${e.customerMemberId}::${e.roomLocationId ?? ""}::${e.date}` : null;
        if (key) {
            if (seen.has(key)) continue;
            seen.add(key);
        }
        out.push(e);
    }
    return out;
}

/**
 * Shared room·date tally — entries without a room are skipped; a child counts once per room per date
 * however many sessions place them there (V7 S6).
 */
function tallyByRoomDate(
    entries: readonly { roomLocationId: string | null; date: string; customerMemberId?: string | null }[]
): { roomLocationId: string; date: string; childCount: number }[] {
    const counts = new Map<string, { roomLocationId: string; date: string; childCount: number }>();
    for (const e of oneEntryPerChildRoomDate(entries)) {
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
