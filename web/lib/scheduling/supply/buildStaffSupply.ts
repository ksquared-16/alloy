/**
 * Staff Supply — which employed staff are actually scheduled at a site.
 *
 * Supply and demand are different truths and never share a field:
 *
 *   DEMAND  `requiredStaff`  — how many staff a room·day needs. Derived from
 *           child occupancy × the configured ratio tiers
 *           (`computeExpectedStaffingByRoomDate`). Says nothing about people.
 *
 *   SUPPLY  this module      — which employed people are scheduled to work
 *           there. Derived from `schedule_assignments` rows with
 *           `subject_type = 'staff'`. Says nothing about whether it is enough.
 *
 * Reuses the one assignment ledger and the one schedule-pattern vocabulary. It
 * introduces no staff table, no second scheduling engine, and no second roster
 * resolver.
 *
 * A scheduled assignment only counts as supply on days its subject is actually
 * employed — an assignment written while employed does not keep producing supply
 * after the employment window closes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { SCHEDULE_ASSIGNMENT_OPERATIONAL_STATUSES } from "@/lib/childcareOperational/enrollmentOperationalStatus";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import {
    indexEmploymentCoverage,
    personIsEmployedOnFromRows,
    type EmploymentCoverageRow,
} from "@/lib/employment/employmentCoverage";
import { readPatternDefaultHours } from "@/lib/scheduling/editorPatterns";
import { formatCompactScheduleHours } from "@/lib/scheduling/projection/projectCompactScheduleForIdentity";

/** One employed person scheduled to work — the minimum a roster needs to place them. */
export type ScheduledStaffMember = {
    assignmentId: string;
    personId: string;
    displayName: string;
    /** Configured position label from the covering employment, when set. */
    positionLabel: string | null;
    employmentId: string | null;
    siteLocationId: string;
    roomLocationId: string | null;
    roomName: string | null;
    /** 0 = Sun … 6 = Sat, from the assignment's schedule pattern. */
    weekdays: number[];
    /** Compact daily hours from the pattern, e.g. "7:30 AM–4:00 PM". Null when unconfigured. */
    timeLabel: string | null;
    effectiveFrom: string;
    effectiveTo: string | null;
    isPrimary: boolean;
    status: string;
};

/** Supply for one room on one date. `roomLocationId` null = assigned to the site, no room. */
export type StaffSupplyCell = {
    date: string;
    weekday: number;
    roomLocationId: string | null;
    scheduledStaffCount: number;
    scheduledStaff: ScheduledStaffMember[];
};

export type StaffSupplyReadModel = {
    siteLocationId: string;
    dateStart: string;
    dateEnd: string;
    /** Every staff member with an assignment overlapping the window. */
    members: ScheduledStaffMember[];
    /** Indexed by `${roomLocationId ?? "__site__"}|${date}`. */
    cells: StaffSupplyCell[];
};

type StaffAssignmentRow = {
    id: string;
    subject_person_id: string | null;
    site_location_id: string | null;
    room_location_id: string | null;
    schedule_pattern_id: string | null;
    start_date: string;
    end_date: string | null;
    status: string;
    is_primary: boolean | null;
};

export const SITE_LEVEL_ROOM_KEY = "__site__";

export function staffSupplyCellKey(roomLocationId: string | null, date: string): string {
    return `${roomLocationId ?? SITE_LEVEL_ROOM_KEY}|${date}`;
}

function weekdayOf(ymd: string): number {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function enumerateDates(dateStart: string, dateEnd: string): string[] {
    const out: string[] = [];
    const [y, m, d] = dateStart.split("-").map(Number);
    const cursor = new Date(Date.UTC(y, m - 1, d));
    for (let i = 0; i < 400; i += 1) {
        const ymd = cursor.toISOString().slice(0, 10);
        if (ymd > dateEnd) break;
        out.push(ymd);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return out;
}

function personDisplayName(row: {
    full_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
}): string {
    const full = (row.full_name ?? "").trim();
    if (full) return full;
    const parts = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
    return parts || "Unnamed person";
}

export type BuildStaffSupplyInput = {
    orgId: string;
    siteLocationId: string;
    dateStart: string;
    dateEnd: string;
};

export async function buildStaffSupply(
    supabase: SupabaseClient,
    input: BuildStaffSupplyInput
): Promise<StaffSupplyReadModel> {
    const { orgId, siteLocationId, dateStart, dateEnd } = input;

    // Committed staff commitments whose effective window overlaps the range.
    // Proposed rows are planning, never supply.
    const { data: assignmentData, error: assignmentError } = await supabase
        .from("schedule_assignments")
        .select(
            "id, subject_person_id, site_location_id, room_location_id, schedule_pattern_id, start_date, end_date, status, is_primary"
        )
        .eq("org_id", orgId)
        .eq("site_location_id", siteLocationId)
        .eq("subject_type", "staff")
        .eq("commitment_kind", "committed")
        .in("status", [...SCHEDULE_ASSIGNMENT_OPERATIONAL_STATUSES])
        .lte("start_date", dateEnd);
    if (assignmentError) {
        throw new OperationalEnrollmentServiceError("db_error", assignmentError.message);
    }

    const rows = ((assignmentData ?? []) as StaffAssignmentRow[]).filter(
        (r) => Boolean(r.subject_person_id) && (r.end_date == null || r.end_date >= dateStart)
    );

    const dates = enumerateDates(dateStart, dateEnd);
    if (rows.length === 0) {
        return { siteLocationId, dateStart, dateEnd, members: [], cells: [] };
    }

    const personIds = [...new Set(rows.map((r) => String(r.subject_person_id)))];
    const patternIds = [...new Set(rows.map((r) => r.schedule_pattern_id).filter((v): v is string => Boolean(v)))];
    const roomIds = [...new Set(rows.map((r) => r.room_location_id).filter((v): v is string => Boolean(v)))];

    const [personsRes, patternsRes, roomsRes, employmentsRes, positionsRes] = await Promise.all([
        supabase
            .from("persons")
            .select("id, full_name, first_name, last_name")
            .eq("org_id", orgId)
            .in("id", personIds),
        patternIds.length > 0
            ? supabase
                  .from("schedule_patterns")
                  .select("id, weekdays, metadata")
                  .eq("org_id", orgId)
                  .in("id", patternIds)
            : Promise.resolve({ data: [] as { id: string; weekdays: number[]; metadata: unknown }[] }),
        roomIds.length > 0
            ? supabase.from("locations").select("id, label").eq("org_id", orgId).in("id", roomIds)
            : Promise.resolve({ data: [] as { id: string; label: string | null }[] }),
        supabase
            .from("employments")
            .select("id, person_id, employment_status, start_date, end_date, position_id")
            .eq("org_id", orgId)
            .in("person_id", personIds),
        supabase.from("employment_positions").select("id, label").eq("org_id", orgId),
    ]);

    const nameByPerson = new Map(
        ((personsRes.data ?? []) as {
            id: string;
            full_name: string | null;
            first_name: string | null;
            last_name: string | null;
        }[]).map((p) => [p.id, personDisplayName(p)])
    );

    const patternById = new Map(
        ((patternsRes.data ?? []) as { id: string; weekdays: number[] | null; metadata: unknown }[]).map((p) => [
            p.id,
            {
                weekdays: Array.isArray(p.weekdays) ? p.weekdays : [],
                hours: readPatternDefaultHours((p.metadata ?? null) as Record<string, unknown> | null),
            },
        ])
    );

    const roomLabelById = new Map(
        ((roomsRes.data ?? []) as { id: string; label: string | null }[]).map((r) => [r.id, r.label ?? null])
    );

    const positionLabelById = new Map(
        ((positionsRes.data ?? []) as { id: string; label: string }[]).map((p) => [p.id, p.label])
    );

    type EmploymentRow = EmploymentCoverageRow & { id: string; position_id: string | null };
    const employmentRows = (employmentsRes.data ?? []) as EmploymentRow[];
    const coverageByPerson = indexEmploymentCoverage(employmentRows);

    /** The employment covering this person on this date, when one does. */
    function employmentOn(personId: string, date: string): EmploymentRow | null {
        const list = (coverageByPerson.get(personId) ?? []) as EmploymentRow[];
        return (
            list.find(
                (e) =>
                    e.employment_status !== "canceled" &&
                    e.start_date <= date &&
                    (e.end_date == null || e.end_date >= date)
            ) ?? null
        );
    }

    // Member identity is stable across the window; the covering employment is
    // read at the assignment's own start so a position rename mid-window does
    // not retroactively relabel history.
    const members: ScheduledStaffMember[] = rows.map((row) => {
        const personId = String(row.subject_person_id);
        const pattern = row.schedule_pattern_id ? patternById.get(row.schedule_pattern_id) : null;
        const employment = employmentOn(personId, row.start_date);
        return {
            assignmentId: row.id,
            personId,
            displayName: nameByPerson.get(personId) ?? "Unnamed person",
            positionLabel: employment?.position_id
                ? (positionLabelById.get(employment.position_id) ?? null)
                : null,
            employmentId: employment?.id ?? null,
            siteLocationId: String(row.site_location_id ?? siteLocationId),
            roomLocationId: row.room_location_id,
            roomName: row.room_location_id ? (roomLabelById.get(row.room_location_id) ?? null) : null,
            weekdays: pattern?.weekdays ?? [],
            timeLabel: pattern?.hours ? formatCompactScheduleHours(pattern.hours) : null,
            effectiveFrom: row.start_date,
            effectiveTo: row.end_date,
            isPrimary: row.is_primary === true,
            status: row.status,
        };
    });

    const memberByAssignment = new Map(members.map((m) => [m.assignmentId, m]));

    const cellByKey = new Map<string, StaffSupplyCell>();
    for (const date of dates) {
        const weekday = weekdayOf(date);
        for (const row of rows) {
            // Effective dating: the assignment must cover the day…
            if (row.start_date > date) continue;
            if (row.end_date != null && row.end_date < date) continue;

            const member = memberByAssignment.get(row.id);
            if (!member) continue;

            // …the pattern must run on that weekday…
            if (member.weekdays.length > 0 && !member.weekdays.includes(weekday)) continue;

            // …and the person must actually be employed that day.
            const personId = member.personId;
            if (!personIsEmployedOnFromRows(employmentRows, personId, date)) continue;

            const key = staffSupplyCellKey(member.roomLocationId, date);
            const existing = cellByKey.get(key);
            if (existing) {
                if (!existing.scheduledStaff.some((s) => s.personId === personId)) {
                    existing.scheduledStaff.push(member);
                    existing.scheduledStaffCount = existing.scheduledStaff.length;
                }
                continue;
            }
            cellByKey.set(key, {
                date,
                weekday,
                roomLocationId: member.roomLocationId,
                scheduledStaffCount: 1,
                scheduledStaff: [member],
            });
        }
    }

    const cells = [...cellByKey.values()].sort(
        (a, b) => a.date.localeCompare(b.date) || (a.roomLocationId ?? "").localeCompare(b.roomLocationId ?? "")
    );

    return { siteLocationId, dateStart, dateEnd, members, cells };
}
