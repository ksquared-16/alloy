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

function indexOperationalByAgreement<T extends { enrollment_agreement_id: string; status: string }>(
    rows: readonly T[]
): Map<string, T> {
    const map = new Map<string, T>();
    for (const row of rows) {
        if (OPERATIONAL_STATUSES.has(row.status)) {
            map.set(row.enrollment_agreement_id, row);
        }
    }
    return map;
}

export type ExpandExpectedAttendanceInput = {
    dateStart: string;
    dateEnd: string;
    agreements: readonly OperationalAgreementInput[];
    placements: readonly OperationalPlacementInput[];
    assignments: readonly OperationalAssignmentInput[];
    patternsById: ReadonlyMap<string, SchedulePatternInput>;
};

/**
 * Expected attendance per child per date: operational schedule assignment x
 * pattern weekdays x committed placement (for room/program), bounded by each
 * row's effective dates. No room is attributed when no operational placement
 * covers the date (surfaced as a warning by the assembler).
 */
export function expandExpectedAttendance(
    input: ExpandExpectedAttendanceInput
): ExpectedAttendanceEntry[] {
    const placementByAgreement = indexOperationalByAgreement(input.placements);
    const assignmentByAgreement = indexOperationalByAgreement(input.assignments);
    const dates = enumerateDates(input.dateStart, input.dateEnd);
    const entries: ExpectedAttendanceEntry[] = [];

    for (const agreement of input.agreements) {
        if (!AGREEMENT_OPERATIONAL_STATUSES.has(agreement.status)) continue;
        const assignment = assignmentByAgreement.get(agreement.id);
        if (!assignment) continue;
        const pattern = input.patternsById.get(assignment.schedule_pattern_id);
        if (!pattern) continue;
        const weekdays = new Set(pattern.weekdays ?? []);
        const placement = placementByAgreement.get(agreement.id);

        for (const date of dates) {
            if (!isWithin(date, agreement.start_date, agreement.end_date)) continue;
            if (!isWithin(date, assignment.start_date, assignment.end_date)) continue;
            const weekday = weekdayOf(date);
            if (!weekdays.has(weekday)) continue;

            const placementCovers = placement && isWithin(date, placement.start_date, placement.end_date);

            entries.push({
                date,
                weekday,
                agreementId: agreement.id,
                customerMemberId: agreement.customer_member_id,
                siteLocationId: agreement.site_location_id,
                roomLocationId: placementCovers ? placement!.room_location_id : null,
                programCategoryId: placementCovers ? placement!.program_category_id : null,
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
        const weekdays = new Set(pattern.weekdays ?? []);

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
