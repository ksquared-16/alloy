/**
 * Site-wide Assignment roster read model — indexes operational assignments for the
 * Assignments Workspace Roster. Includes proposed (pre-enrollment) member-scoped
 * rows so planning is visible without counting them as attendance truth.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    CHILD_ENROLLMENT_AGREEMENT_OPERATIONAL_STATUSES,
    SCHEDULE_ASSIGNMENT_OPERATIONAL_STATUSES,
} from "@/lib/childcareOperational/enrollmentOperationalStatus";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { resolveAssignmentLifecycleState } from "@/lib/operationalAssignments/assignmentLifecycleState";
import { formatWeekdays } from "@/lib/scheduling/projection/buildSchedulingProjection";
import type { AssignmentTypePresentation } from "@/lib/scheduling/projection/schedulingProjectionTypes";
import { readPatternDefaultHours } from "@/lib/scheduling/editorPatterns";
import { formatCompactScheduleHours } from "@/lib/scheduling/projection/projectCompactScheduleForIdentity";
import { resolveIdentityPhotoUrlFromMetadata } from "@/lib/adminV2/runtime/focusPanel/resolveIdentityPhotoUrl";
import type { DocumentActor } from "@/lib/documents/assertDocumentAccess";
import {
    profilePhotoDocumentId,
    resolveProfilePhotosForActor,
} from "@/lib/documents/profilePhotoPresentation";

export type AssignmentRosterRow = {
    assignmentId: string;
    agreementId: string;
    customerMemberId: string;
    childName: string;
    /** The child/staff person id backing this row, when resolved — used for avatar lookup. */
    personId?: string | null;
    subjectType: "child" | "staff";
    isPrimary: boolean;
    roleLabel: "Primary" | "Secondary";
    assignmentTypeLabel: string | null;
    roomName: string | null;
    weekdaysLabel: string;
    effectiveFrom: string;
    effectiveTo: string | null;
    status: string;
    /** Operator lifecycle label (Proposed / Upcoming / Active / …). */
    lifecycleLabel: string;
    commitmentKind: "proposed" | "committed";
    /** Compact daily hours from the schedule pattern (e.g. "7:30 AM–5:30 PM"), when configured. */
    timeLabel?: string | null;
};

export type AssignmentRosterSubject = {
    agreementId: string;
    customerMemberId: string;
    childName: string;
    subjectType: "child" | "staff";
    assignmentCount: number;
    primaryRoom: string | null;
    assignments: AssignmentRosterRow[];
    /** Profile image URL when the child's person record carries one, else null → initials avatar. */
    imageUrl?: string | null;
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
    start_date: string;
    end_date: string | null;
    status: string;
    commitment_kind: string | null;
};

type TypeRow = {
    id: string;
    label: string;
};

function memberSubjectKey(customerMemberId: string): string {
    return `member:${customerMemberId}`;
}

async function resolvePersonNames(
    supabase: SupabaseClient,
    orgId: string,
    personIds: string[],
    documentActor?: DocumentActor | null,
): Promise<{ names: Map<string, string>; imageUrls: Map<string, string> }> {
    const names = new Map<string, string>();
    const imageUrls = new Map<string, string>();
    if (personIds.length === 0) return { names, imageUrls };
    const { data } = await supabase
        .from("persons")
        .select("id, full_name, first_name, last_name, metadata")
        .eq("org_id", orgId)
        .in("id", personIds);
    const peopleForPhotos: Array<{ personId: string; metadata: Record<string, unknown> | null }> = [];
    for (const p of (data ?? []) as {
        id: string;
        full_name: string | null;
        first_name: string | null;
        last_name: string | null;
        metadata: unknown;
    }[]) {
        const composed = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
        const name = p.full_name?.trim() || composed;
        if (name) names.set(p.id, name);
        const meta =
            p.metadata && typeof p.metadata === "object" && !Array.isArray(p.metadata)
                ? (p.metadata as Record<string, unknown>)
                : null;
        // Prefer actor-scoped resolution from profile_photo_document_id; keep stable external URLs.
        if (documentActor?.ok && profilePhotoDocumentId(meta)) {
            peopleForPhotos.push({ personId: p.id, metadata: meta });
        } else {
            const photo = resolveIdentityPhotoUrlFromMetadata(meta);
            if (photo) imageUrls.set(p.id, photo);
        }
    }
    if (documentActor?.ok && peopleForPhotos.length > 0) {
        const resolved = await resolveProfilePhotosForActor({
            supabase,
            actor: documentActor,
            people: peopleForPhotos,
        });
        for (const [personId, hit] of resolved) {
            if (hit.photoUrl) imageUrls.set(personId, hit.photoUrl);
        }
    }
    return { names, imageUrls };
}

async function resolveMemberPersonIds(
    supabase: SupabaseClient,
    orgId: string,
    memberIds: string[]
): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const distinct = [...new Set(memberIds.filter(Boolean))];
    if (distinct.length === 0) return map;
    const { data } = await supabase
        .from("customer_members")
        .select("id, person_id")
        .eq("org_id", orgId)
        .in("id", distinct);
    for (const row of (data ?? []) as { id: string; person_id: string | null }[]) {
        if (row.person_id) map.set(row.id, row.person_id);
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
): Promise<{ weekdaysById: Map<string, number[]>; timeLabelById: Map<string, string> }> {
    const weekdaysById = new Map<string, number[]>();
    const timeLabelById = new Map<string, string>();
    const distinct = [...new Set(patternIds.filter(Boolean))];
    if (distinct.length === 0) return { weekdaysById, timeLabelById };
    const { data } = await supabase
        .from("schedule_patterns")
        .select("id, weekdays, metadata")
        .eq("org_id", orgId)
        .in("id", distinct);
    for (const row of (data ?? []) as {
        id: string;
        weekdays: number[] | null;
        metadata: Record<string, unknown> | null;
    }[]) {
        weekdaysById.set(row.id, Array.isArray(row.weekdays) ? row.weekdays.map(Number) : []);
        const hours = readPatternDefaultHours(row.metadata ?? null);
        const timeLabel = hours ? formatCompactScheduleHours(hours.arrive, hours.depart) : null;
        if (timeLabel) timeLabelById.set(row.id, timeLabel);
    }
    return { weekdaysById, timeLabelById };
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

/** Load the site Assignment roster — agreement-backed + proposed member-scoped rows. */
export async function buildAssignmentRosterReadModel(
    supabase: SupabaseClient,
    orgId: string,
    siteLocationId: string,
    documentActor?: DocumentActor | null,
): Promise<AssignmentRosterReadModel> {
    const asOf = new Date().toISOString().slice(0, 10);

    const { data: agreementData, error: agreementError } = await supabase
        .from("child_enrollment_agreements")
        .select("id, customer_member_id, person_id")
        .eq("org_id", orgId)
        .eq("site_location_id", siteLocationId)
        .in("status", [...CHILD_ENROLLMENT_AGREEMENT_OPERATIONAL_STATUSES]);
    if (agreementError) throw new OperationalEnrollmentServiceError("db_error", agreementError.message);

    const agreements = (agreementData ?? []) as AgreementRow[];
    const agreementByMember = new Map<string, AgreementRow>();
    for (const a of agreements) agreementByMember.set(a.customer_member_id, a);

    const { data: assignmentData, error: assignmentError } = await supabase
        .from("schedule_assignments")
        .select(
            "id, enrollment_agreement_id, customer_member_id, subject_type, subject_person_id, is_primary, operational_assignment_type_id, schedule_pattern_id, room_location_id, start_date, end_date, status, commitment_kind"
        )
        .eq("org_id", orgId)
        .eq("site_location_id", siteLocationId)
        .in("status", [...SCHEDULE_ASSIGNMENT_OPERATIONAL_STATUSES])
        .order("is_primary", { ascending: false })
        .order("start_date", { ascending: true });
    if (assignmentError) throw new OperationalEnrollmentServiceError("db_error", assignmentError.message);

    const rows = (assignmentData ?? []) as AssignmentRow[];
    if (rows.length === 0) {
        return { subjects: [], totalAssignments: 0, staffReady: true };
    }

    const memberIds = [
        ...new Set(
            rows
                .map((r) => r.customer_member_id)
                .filter((id): id is string => Boolean(id))
        ),
    ];
    const memberPersonIds = await resolveMemberPersonIds(supabase, orgId, memberIds);
    const personIds = [
        ...new Set([
            ...agreements.map((a) => a.person_id).filter((id): id is string => Boolean(id)),
            ...memberPersonIds.values(),
        ]),
    ];
    const { names: nameByPersonId, imageUrls: imageUrlByPersonId } = await resolvePersonNames(
        supabase,
        orgId,
        personIds,
        documentActor,
    );

    const roomIds = rows.map((r) => r.room_location_id).filter((id): id is string => Boolean(id));
    const patternIds = rows.map((r) => r.schedule_pattern_id).filter((id): id is string => Boolean(id));
    const typeIds = rows
        .map((r) => r.operational_assignment_type_id)
        .filter((id): id is string => Boolean(id));

    const [roomLabels, { weekdaysById: patternWeekdays, timeLabelById: patternTimeLabels }, typeMap] = await Promise.all([
        resolveLocationLabels(supabase, orgId, roomIds),
        resolvePatternWeekdays(supabase, orgId, patternIds),
        resolveAssignmentTypes(supabase, orgId, typeIds),
    ]);

    const bySubject = new Map<string, AssignmentRosterRow[]>();
    const personIdBySubject = new Map<string, string>();
    for (const row of rows) {
        const memberId = row.customer_member_id;
        if (!memberId) continue;
        const agreement =
            (row.enrollment_agreement_id
                ? agreements.find((a) => a.id === row.enrollment_agreement_id)
                : null) ?? agreementByMember.get(memberId) ?? null;
        const subjectKey = agreement?.id ?? memberSubjectKey(memberId);
        const personId = agreement?.person_id ?? memberPersonIds.get(memberId) ?? null;
        const childName = (personId && nameByPersonId.get(personId)) || "Unnamed child";
        if (personId) personIdBySubject.set(subjectKey, personId);
        const subjectType = row.subject_type === "staff" ? "staff" : "child";
        const weekdays = (row.schedule_pattern_id ? patternWeekdays.get(row.schedule_pattern_id) : []) ?? [];
        const timeLabel = (row.schedule_pattern_id ? patternTimeLabels.get(row.schedule_pattern_id) : null) ?? null;
        const type = row.operational_assignment_type_id
            ? typeMap.get(row.operational_assignment_type_id)
            : null;
        const commitmentKind = row.commitment_kind === "proposed" ? "proposed" : "committed";
        const lifecycle = resolveAssignmentLifecycleState({
            commitmentKind,
            status: row.status,
            effectiveFrom: row.start_date,
            effectiveTo: row.end_date,
            openEnded: !row.end_date,
            asOf,
        });
        const rosterRow: AssignmentRosterRow = {
            assignmentId: row.id,
            agreementId: subjectKey,
            customerMemberId: memberId,
            childName,
            personId,
            subjectType,
            isPrimary: row.is_primary === true,
            roleLabel: row.is_primary ? "Primary" : "Secondary",
            assignmentTypeLabel: type?.label ?? null,
            roomName: row.room_location_id ? roomLabels.get(row.room_location_id) ?? null : null,
            weekdaysLabel: weekdays.length ? formatWeekdays(weekdays) : "—",
            effectiveFrom: row.start_date,
            effectiveTo: row.end_date,
            status: row.status,
            lifecycleLabel: lifecycle.label,
            commitmentKind,
            timeLabel,
        };
        const list = bySubject.get(subjectKey) ?? [];
        list.push(rosterRow);
        bySubject.set(subjectKey, list);
    }

    const subjects: AssignmentRosterSubject[] = [];
    for (const [subjectKey, assignments] of bySubject) {
        if (assignments.length === 0) continue;
        assignments.sort((a, b) => {
            if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
            return a.effectiveFrom.localeCompare(b.effectiveFrom);
        });
        const primary = assignments.find((a) => a.isPrimary) ?? assignments[0];
        subjects.push({
            agreementId: subjectKey,
            customerMemberId: primary.customerMemberId,
            childName: primary.childName,
            subjectType: primary.subjectType,
            assignmentCount: assignments.length,
            primaryRoom: primary?.roomName ?? null,
            assignments,
            imageUrl: primary.personId ? imageUrlByPersonId.get(primary.personId) ?? null : null,
        });
    }

    subjects.sort((a, b) => a.childName.localeCompare(b.childName));

    return {
        subjects,
        totalAssignments: rows.length,
        staffReady: true,
    };
}
