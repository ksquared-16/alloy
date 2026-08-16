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
    /**
     * Stable grouping key for the subject this row belongs to. Namespaced by
     * subject type so a child and a staff member can never collide:
     * `agreement:<id>` / `member:<id>` for children, `staff:<personId>` for staff.
     */
    subjectKey: string;
    /** Child or staff display name. */
    subjectName: string;
    /** Child subjects only. Null for staff — the DB constraint requires it. */
    customerMemberId: string | null;
    /** Child subjects only. Null for staff and for proposed member-scoped rows. */
    enrollmentAgreementId: string | null;
    /** The child/staff person id backing this row, when resolved — used for avatar lookup. */
    personId?: string | null;
    /** Staff subjects only — configured position from the covering employment. */
    positionLabel?: string | null;
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
    subjectKey: string;
    subjectName: string;
    customerMemberId: string | null;
    enrollmentAgreementId: string | null;
    positionLabel?: string | null;
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
    /** How many of `subjects` are staff — 0 is a fact, not an absence of support. */
    staffSubjectCount: number;
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
    site_location_id: string | null;
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

function agreementSubjectKey(agreementId: string): string {
    return `agreement:${agreementId}`;
}

/** Staff never share a namespace with children — one person, one staff subject. */
function staffSubjectKey(personId: string): string {
    return `staff:${personId}`;
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

/**
 * The member rows behind child assignments — their person link AND their own name.
 *
 * ── THE CHILD IS THE MEMBER ROW ──
 *
 * This read already existed and threw the name away, taking only `person_id`. Every child subject
 * was then named through `persons`, so a child whose `customer_members.person_id` is NULL — ordinary,
 * the column is nullable and a child can exist with no `persons` row at all — displayed as "Unnamed
 * child" in EVERY consumer of this projection, while `customer_members.display_name` sat NOT NULL
 * one column away in a row this function was already fetching.
 *
 * That is the defect class `durableChildSubjectModel` already records: keying a child on `person_id`
 * silently reframes the question as "this person" and loses every child who is not one.
 */
async function resolveMemberIdentities(
    supabase: SupabaseClient,
    orgId: string,
    memberIds: string[]
): Promise<{ personIdByMember: Map<string, string>; nameByMember: Map<string, string> }> {
    const personIdByMember = new Map<string, string>();
    const nameByMember = new Map<string, string>();
    const distinct = [...new Set(memberIds.filter(Boolean))];
    if (distinct.length === 0) return { personIdByMember, nameByMember };
    const { data } = await supabase
        .from("customer_members")
        .select("id, person_id, display_name, first_name, last_name")
        .eq("org_id", orgId)
        .in("id", distinct);
    for (const row of (data ?? []) as {
        id: string;
        person_id: string | null;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
    }[]) {
        if (row.person_id) personIdByMember.set(row.id, row.person_id);
        // `display_name` is NOT NULL in the schema, so the name parts are a defence against
        // whitespace rather than a genuine second source.
        const name =
            (row.display_name ?? "").trim()
            || [row.first_name ?? "", row.last_name ?? ""].map((s) => s.trim()).filter(Boolean).join(" ");
        if (name) nameByMember.set(row.id, name);
    }
    return { personIdByMember, nameByMember };
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

/**
 * Configured position label per staff person, from the covering employment.
 * Employment is the owner of "in what capacity" — the assignment ledger is not.
 */
async function resolveStaffPositionLabels(
    supabase: SupabaseClient,
    orgId: string,
    personIds: string[]
): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const distinct = [...new Set(personIds.filter(Boolean))];
    if (distinct.length === 0) return map;

    const { data: employments } = await supabase
        .from("employments")
        .select("person_id, position_id, employment_status, start_date")
        .eq("org_id", orgId)
        .in("person_id", distinct);

    const rows = (employments ?? []) as {
        person_id: string;
        position_id: string | null;
        employment_status: string;
        start_date: string;
    }[];
    const positionIds = [...new Set(rows.map((r) => r.position_id).filter((v): v is string => Boolean(v)))];
    if (positionIds.length === 0) return map;

    const { data: positions } = await supabase
        .from("employment_positions")
        .select("id, label")
        .eq("org_id", orgId)
        .in("id", positionIds);
    const labelById = new Map(((positions ?? []) as { id: string; label: string }[]).map((p) => [p.id, p.label]));

    // Prefer the open employment; fall back to the most recent period so an
    // ended staff member still reads as what they were.
    const byPerson = new Map<string, { position_id: string | null; open: boolean; start_date: string }>();
    for (const r of rows) {
        const open = ["pending_start", "active", "ending"].includes(r.employment_status);
        const current = byPerson.get(r.person_id);
        const better =
            !current ||
            (open && !current.open) ||
            (open === current.open && r.start_date > current.start_date);
        if (better) byPerson.set(r.person_id, { position_id: r.position_id, open, start_date: r.start_date });
    }
    for (const [personId, entry] of byPerson) {
        if (entry.position_id) {
            const label = labelById.get(entry.position_id);
            if (label) map.set(personId, label);
        }
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
            "id, enrollment_agreement_id, customer_member_id, site_location_id, subject_type, subject_person_id, is_primary, operational_assignment_type_id, schedule_pattern_id, room_location_id, start_date, end_date, status, commitment_kind"
        )
        .eq("org_id", orgId)
        .eq("site_location_id", siteLocationId)
        .in("status", [...SCHEDULE_ASSIGNMENT_OPERATIONAL_STATUSES])
        .order("is_primary", { ascending: false })
        .order("start_date", { ascending: true });
    if (assignmentError) throw new OperationalEnrollmentServiceError("db_error", assignmentError.message);

    const rows = (assignmentData ?? []) as AssignmentRow[];
    if (rows.length === 0) {
        return { subjects: [], totalAssignments: 0, staffSubjectCount: 0 };
    }

    const memberIds = [
        ...new Set(
            rows
                .map((r) => r.customer_member_id)
                .filter((id): id is string => Boolean(id))
        ),
    ];
    const { personIdByMember: memberPersonIds, nameByMember: memberNames } =
        await resolveMemberIdentities(supabase, orgId, memberIds);
    const staffPersonIds = [
        ...new Set(
            rows
                .filter((r) => r.subject_type === "staff")
                .map((r) => r.subject_person_id)
                .filter((id): id is string => Boolean(id))
        ),
    ];
    const personIds = [
        ...new Set([
            ...agreements.map((a) => a.person_id).filter((id): id is string => Boolean(id)),
            ...memberPersonIds.values(),
            ...staffPersonIds,
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

    const [roomLabels, { weekdaysById: patternWeekdays, timeLabelById: patternTimeLabels }, typeMap, staffPositions] =
        await Promise.all([
            resolveLocationLabels(supabase, orgId, roomIds),
            resolvePatternWeekdays(supabase, orgId, patternIds),
            resolveAssignmentTypes(supabase, orgId, typeIds),
            resolveStaffPositionLabels(supabase, orgId, staffPersonIds),
        ]);

    const bySubject = new Map<string, AssignmentRosterRow[]>();
    for (const row of rows) {
        const subjectType = row.subject_type === "staff" ? "staff" : "child";

        // Subject-aware resolution. The ledger is one table with two subject
        // shapes; each is read through its own declared identity, and neither is
        // coerced into the other. Previously every staff row was dropped here
        // because `customer_member_id` is NULL for staff BY CONSTRAINT.
        let subjectKey: string;
        let subjectName: string;
        let personId: string | null;
        let customerMemberId: string | null;
        let enrollmentAgreementId: string | null;
        let positionLabel: string | null = null;

        if (subjectType === "staff") {
            const staffPersonId = row.subject_person_id;
            if (!staffPersonId) continue; // malformed staff row — no identity to project
            subjectKey = staffSubjectKey(staffPersonId);
            personId = staffPersonId;
            subjectName = nameByPersonId.get(staffPersonId) || "Unnamed staff";
            customerMemberId = null;
            enrollmentAgreementId = null;
            positionLabel = staffPositions.get(staffPersonId) ?? null;
        } else {
            const memberId = row.customer_member_id;
            if (!memberId) continue; // child rows require a member — integrity unchanged
            const agreement =
                (row.enrollment_agreement_id
                    ? agreements.find((a) => a.id === row.enrollment_agreement_id)
                    : null) ?? agreementByMember.get(memberId) ?? null;
            subjectKey = agreement ? agreementSubjectKey(agreement.id) : memberSubjectKey(memberId);
            personId = agreement?.person_id ?? memberPersonIds.get(memberId) ?? null;
            /*
             * THE MEMBER ROW FIRST — it is the child's canonical identity, and it is the one source
             * that is always there. The person name remains as enrichment for a member row whose own
             * name is somehow blank; "Unnamed child" now means the data is genuinely wrong rather
             * than merely un-linked.
             *
             * Precedence matches `composeDurableChildSubject`, deliberately: the membership is what
             * an operator maintains for a child, so the two surfaces cannot name the same child
             * differently.
             */
            subjectName =
                memberNames.get(memberId)
                || (personId && nameByPersonId.get(personId))
                || "Unnamed child";
            customerMemberId = memberId;
            enrollmentAgreementId = agreement?.id ?? null;
        }

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
            subjectKey,
            subjectName,
            customerMemberId,
            enrollmentAgreementId,
            personId,
            positionLabel,
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
            subjectKey,
            subjectName: primary.subjectName,
            customerMemberId: primary.customerMemberId,
            enrollmentAgreementId: primary.enrollmentAgreementId,
            positionLabel: primary.positionLabel ?? null,
            subjectType: primary.subjectType,
            assignmentCount: assignments.length,
            primaryRoom: primary?.roomName ?? null,
            assignments,
            imageUrl: primary.personId ? imageUrlByPersonId.get(primary.personId) ?? null : null,
        });
    }

    subjects.sort((a, b) => a.subjectName.localeCompare(b.subjectName));

    return {
        subjects,
        totalAssignments: rows.length,
        staffSubjectCount: subjects.filter((s) => s.subjectType === "staff").length,
    };
}
