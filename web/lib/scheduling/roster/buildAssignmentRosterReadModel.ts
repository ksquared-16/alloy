/**
 * Site-wide Assignment roster read model — indexes operational assignments for the
 * Assignments Workspace Roster. Consumes `schedule_assignments` + Assignment Platform
 * presentation; never duplicates schedule-expectation logic from the room board.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    CHILD_ENROLLMENT_AGREEMENT_OPERATIONAL_STATUSES,
    SCHEDULE_ASSIGNMENT_OPERATIONAL_STATUSES,
} from "@/lib/childcareOperational/enrollmentOperationalStatus";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { formatWeekdays } from "@/lib/scheduling/projection/buildSchedulingProjection";
import type { AssignmentTypePresentation } from "@/lib/scheduling/projection/schedulingProjectionTypes";

export type AssignmentRosterRow = {
    assignmentId: string;
    agreementId: string;
    customerMemberId: string;
    childName: string;
    subjectType: "child" | "staff";
    isPrimary: boolean;
    roleLabel: "Primary" | "Secondary";
    assignmentTypeLabel: string | null;
    roomName: string | null;
    weekdaysLabel: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    status: string;
};

export type AssignmentRosterSubject = {
    agreementId: string;
    customerMemberId: string;
    childName: string;
    subjectType: "child" | "staff";
    assignmentCount: number;
    primaryRoom: string | null;
    assignments: AssignmentRosterRow[];
};

export type AssignmentRosterReadModel = {
    subjects: AssignmentRosterSubject[];
    totalAssignments: number;
    staffReady: boolean;
};

type AgreementRow = {
    id: string;
    customer_member_id: string;
    person_id: string | null;
};

type AssignmentRow = {
    id: string;
    enrollment_agreement_id: string | null;
    customer_member_id: string | null;
    subject_type: string | null;
    subject_person_id: string | null;
    is_primary: boolean | null;
    operational_assignment_type_id: string | null;
    schedule_pattern_id: string | null;
    room_location_id: string | null;
    weekdays: number[] | null;
    start_date: string;
    end_date: string | null;
    status: string;
};

type TypeRow = {
    id: string;
    label: string;
};

async function resolvePersonNames(
    supabase: SupabaseClient,
    orgId: string,
    personIds: string[]
): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (personIds.length === 0) return map;
    const { data } = await supabase
        .from("persons")
        .select("id, display_name")
        .eq("org_id", orgId)
        .in("id", personIds);
    for (const p of (data ?? []) as { id: string; display_name: string | null }[]) {
        if (p.display_name) map.set(p.id, p.display_name);
    }
    return map;
}

async function resolveLocationLabels(
    supabase: SupabaseClient,
    orgId: string,
    locationIds: string[]
): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const distinct = [...new Set(locationIds.filter(Boolean))];
    if (distinct.length === 0) return map;
    const { data } = await supabase
        .from("locations")
        .select("id, label")
        .eq("org_id", orgId)
        .in("id", distinct);
    for (const row of (data ?? []) as { id: string; label: string | null }[]) {
        map.set(row.id, row.label?.trim() || "Room");
    }
    return map;
}

async function resolvePatternWeekdays(
    supabase: SupabaseClient,
    orgId: string,
    patternIds: string[]
): Promise<Map<string, number[]>> {
    const map = new Map<string, number[]>();
    const distinct = [...new Set(patternIds.filter(Boolean))];
    if (distinct.length === 0) return map;
    const { data } = await supabase
        .from("schedule_patterns")
        .select("id, weekdays")
        .eq("org_id", orgId)
        .in("id", distinct);
    for (const row of (data ?? []) as { id: string; weekdays: number[] | null }[]) {
        map.set(row.id, Array.isArray(row.weekdays) ? row.weekdays.map(Number) : []);
    }
    return map;
}

async function resolveAssignmentTypes(
    supabase: SupabaseClient,
    orgId: string,
    typeIds: string[]
): Promise<Map<string, AssignmentTypePresentation>> {
    const map = new Map<string, AssignmentTypePresentation>();
    const distinct = [...new Set(typeIds.filter(Boolean))];
    if (distinct.length === 0) return map;
    const { data, error } = await supabase
        .from("operational_assignment_types")
        .select("id, key, label, icon_key, visual_tone, billing_participation, attendance_participation, staffing_participation")
        .eq("org_id", orgId)
        .in("id", distinct);
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    for (const raw of (data ?? []) as Array<
        TypeRow & {
            key: string;
            icon_key: string | null;
            visual_tone: AssignmentTypePresentation["visualTone"];
            billing_participation: AssignmentTypePresentation["billingParticipation"];
            attendance_participation: AssignmentTypePresentation["attendanceParticipation"];
            staffing_participation: AssignmentTypePresentation["staffingParticipation"];
        }
    >) {
        map.set(raw.id, {
            id: raw.id,
            key: raw.key,
            label: raw.label,
            iconKey: raw.icon_key,
            visualTone: raw.visual_tone,
            billingParticipation: raw.billing_participation,
            attendanceParticipation: raw.attendance_participation,
            staffingParticipation: raw.staffing_participation,
        });
    }
    return map;
}

/** Load the site Assignment roster — one row per assignment, grouped by child subject. */
export async function buildAssignmentRosterReadModel(
    supabase: SupabaseClient,
    orgId: string,
    siteLocationId: string
): Promise<AssignmentRosterReadModel> {
    const { data: agreementData, error: agreementError } = await supabase
        .from("child_enrollment_agreements")
        .select("id, customer_member_id, person_id")
        .eq("org_id", orgId)
        .eq("site_location_id", siteLocationId)
        .in("status", [...CHILD_ENROLLMENT_AGREEMENT_OPERATIONAL_STATUSES]);
    if (agreementError) throw new OperationalEnrollmentServiceError("db_error", agreementError.message);

    const agreements = (agreementData ?? []) as AgreementRow[];
    if (agreements.length === 0) {
        return { subjects: [], totalAssignments: 0, staffReady: true };
    }

    const agreementIds = agreements.map((a) => a.id);
    const personIds = [...new Set(agreements.map((a) => a.person_id).filter((id): id is string => !!id))];
    const nameByPersonId = await resolvePersonNames(supabase, orgId, personIds);
    const nameByAgreementId = new Map<string, string>();
    for (const a of agreements) {
        const name = (a.person_id && nameByPersonId.get(a.person_id)) || "Unnamed child";
        nameByAgreementId.set(a.id, name);
    }

    const { data: assignmentData, error: assignmentError } = await supabase
        .from("schedule_assignments")
        .select(
            "id, enrollment_agreement_id, customer_member_id, subject_type, subject_person_id, is_primary, operational_assignment_type_id, schedule_pattern_id, room_location_id, weekdays, start_date, end_date, status"
        )
        .eq("org_id", orgId)
        .in("enrollment_agreement_id", agreementIds)
        .in("status", [...SCHEDULE_ASSIGNMENT_OPERATIONAL_STATUSES])
        .order("is_primary", { ascending: false })
        .order("start_date", { ascending: true });
    if (assignmentError) throw new OperationalEnrollmentServiceError("db_error", assignmentError.message);

    const rows = (assignmentData ?? []) as AssignmentRow[];
    const roomIds = rows.map((r) => r.room_location_id).filter((id): id is string => !!id);
    const patternIds = rows.map((r) => r.schedule_pattern_id).filter((id): id is string => !!id);
    const typeIds = rows.map((r) => r.operational_assignment_type_id).filter((id): id is string => !!id);

    const [roomLabels, patternWeekdays, typeMap] = await Promise.all([
        resolveLocationLabels(supabase, orgId, roomIds),
        resolvePatternWeekdays(supabase, orgId, patternIds),
        resolveAssignmentTypes(supabase, orgId, typeIds),
    ]);

    const byAgreement = new Map<string, AssignmentRosterRow[]>();
    for (const row of rows) {
        const agreementId = row.enrollment_agreement_id;
        if (!agreementId) continue;
        const subjectType = row.subject_type === "staff" ? "staff" : "child";
        const weekdays =
            Array.isArray(row.weekdays) && row.weekdays.length > 0
                ? row.weekdays.map(Number)
                : (row.schedule_pattern_id ? patternWeekdays.get(row.schedule_pattern_id) : []) ?? [];
        const type = row.operational_assignment_type_id
            ? typeMap.get(row.operational_assignment_type_id)
            : null;
        const rosterRow: AssignmentRosterRow = {
            assignmentId: row.id,
            agreementId,
            customerMemberId: row.customer_member_id ?? agreements.find((a) => a.id === agreementId)?.customer_member_id ?? "",
            childName: nameByAgreementId.get(agreementId) ?? "Unnamed child",
            subjectType,
            isPrimary: row.is_primary === true,
            roleLabel: row.is_primary ? "Primary" : "Secondary",
            assignmentTypeLabel: type?.label ?? null,
            roomName: row.room_location_id ? roomLabels.get(row.room_location_id) ?? null : null,
            weekdaysLabel: weekdays.length ? formatWeekdays(weekdays) : "—",
            effectiveFrom: row.start_date,
            effectiveTo: row.end_date,
            status: row.status,
        };
        const list = byAgreement.get(agreementId) ?? [];
        list.push(rosterRow);
        byAgreement.set(agreementId, list);
    }

    const subjects: AssignmentRosterSubject[] = [];
    for (const agreement of agreements) {
        const assignments = byAgreement.get(agreement.id) ?? [];
        if (assignments.length === 0) continue;
        const primary = assignments.find((a) => a.isPrimary) ?? assignments[0];
        subjects.push({
            agreementId: agreement.id,
            customerMemberId: agreement.customer_member_id,
            childName: nameByAgreementId.get(agreement.id) ?? "Unnamed child",
            subjectType: "child",
            assignmentCount: assignments.length,
            primaryRoom: primary?.roomName ?? null,
            assignments,
        });
    }

    subjects.sort((a, b) => a.childName.localeCompare(b.childName));

    return {
        subjects,
        totalAssignments: rows.length,
        staffReady: true,
    };
}
