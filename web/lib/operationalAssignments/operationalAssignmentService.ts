/**
 * Invariant-owning writes for recurring operational assignments.
 *
 * The compatible storage table is still named `schedule_assignments`; it is
 * deliberately extended in place so children and staff do not acquire
 * competing scheduling engines. Public mutation routes must invoke this
 * service through a registered command.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { derivePlacementStatusFromStartDate } from "@/lib/childcareOperational/enrollmentOperationalStatus";
import type { ScheduleAssignmentRow } from "@/lib/childcareOperational/enrollmentOperationalTypes";
import { OperationalEnrollmentServiceError, trimOrNull } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { assertValidIsoDate, computePriorRowCloseDate } from "@/lib/childcareOperational/effectiveDating";
import { getAgreementById } from "@/lib/childcareOperational/enrollmentAgreementService";
import { validateRoomLocationUnderSite, validateSchedulePatternForSite } from "@/lib/childcareOperational/validateChildcareLocationRefs";
import { canonicalUnitRoleFromStorage, isOperationalGroupRole } from "@/lib/location/canonicalLocationModel";
import { assertStaffPersonEligibleForAssignment } from "@/lib/operationalAssignments/staffAssignmentEligibility";

export type OperationalAssignmentSubject =
    | {
          type: "child";
          /** When set → committed assignment. */
          enrollmentAgreementId?: string | null;
          /** Required for proposed (and preferred for listing). */
          customerMemberId?: string | null;
          /** Required when creating proposed without an agreement. */
          siteLocationId?: string | null;
      }
    | {
          type: "staff";
          personId: string;
          siteLocationId: string;
      };

export type CreateOperationalAssignmentInput = {
    orgId: string;
    subject: OperationalAssignmentSubject;
    schedulePatternId: string;
    startDate: string;
    /**
     * Optional close date for a bounded commitment (a summer placement, a cover
     * shift). Null/omitted = open-ended.
     *
     * This used to be absent from the input entirely while the insert hardcoded
     * `end_date: null`, so any caller-supplied end date was silently discarded
     * and the row read as open-ended forever. Roster accuracy depends on this
     * being real effective-date truth.
     */
    endDate?: string | null;
    roomLocationId?: string | null;
    programCategoryId?: string | null;
    assignmentTypeId?: string | null;
    /**
     * Only child assignments may be primary. A primary change must supersede
     * the prior primary through a dedicated command; this create operation
     * cannot silently replace an operational home.
     * Proposed primaries are planning-only (commitment_kind = proposed).
     */
    isPrimary?: boolean;
    /**
     * When set, close this prior operational assignment (effective-dated supersede)
     * and insert the new row. Used for Edit Assignment on a secondary commitment.
     * Primary home changes still use `assignment.set_primary`.
     */
    supersedesAssignmentId?: string | null;
    /**
     * Force proposed even if an agreement id is present (rare). Default: proposed
     * when agreement is absent, committed when present.
     */
    commitmentKind?: "proposed" | "committed";
    sourceKey?: string;
    metadata?: Record<string, unknown>;
    actorUserId?: string | null;
    todayYmd: string;
};

export type ListOperationalAssignmentFilters = {
    subject?: OperationalAssignmentSubject;
    includeTerminal?: boolean;
    /** When true, include proposed rows (default true). */
    includeProposed?: boolean;
};

function assertNonBlank(value: string | null, field: string): string {
    if (!value) {
        throw new OperationalEnrollmentServiceError("invalid_input", `${field} is required`);
    }
    return value;
}

async function resolveSubjectSite(
    supabase: SupabaseClient,
    orgId: string,
    subject: OperationalAssignmentSubject,
    commitmentKind: "proposed" | "committed",
    /** Assignment effective date — employment eligibility is answered at that date. */
    onDate: string
): Promise<{
    siteLocationId: string;
    enrollmentAgreementId: string | null;
    customerMemberId: string | null;
    personId: string | null;
    commitmentKind: "proposed" | "committed";
}> {
    if (subject.type === "child") {
        const agreementId = trimOrNull(subject.enrollmentAgreementId);
        if (commitmentKind === "committed" || agreementId) {
            const enrollmentAgreementId = assertNonBlank(agreementId, "enrollment");
            const agreement = await getAgreementById(supabase, orgId, enrollmentAgreementId);
            if (!agreement) {
                throw new OperationalEnrollmentServiceError("not_found", "Enrollment agreement not found");
            }
            if (agreement.status === "canceled" || agreement.status === "ended") {
                throw new OperationalEnrollmentServiceError(
                    "invalid_state",
                    "Cannot create an assignment for a terminal enrollment agreement",
                    { status: agreement.status }
                );
            }
            return {
                siteLocationId: agreement.site_location_id,
                enrollmentAgreementId: agreement.id,
                customerMemberId: agreement.customer_member_id,
                personId: null,
                commitmentKind: "committed",
            };
        }

        // Proposed — participation / inquiry child, no agreement.
        const customerMemberId = assertNonBlank(trimOrNull(subject.customerMemberId), "child");
        const siteLocationId = assertNonBlank(trimOrNull(subject.siteLocationId), "site");
        const { data: member, error } = await supabase
            .from("customer_members")
            .select("id, org_id")
            .eq("org_id", orgId)
            .eq("id", customerMemberId)
            .maybeSingle();
        if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
        if (!member) {
            throw new OperationalEnrollmentServiceError("not_found", "Child was not found for this organization");
        }
        return {
            siteLocationId,
            enrollmentAgreementId: null,
            customerMemberId,
            personId: null,
            commitmentKind: "proposed",
        };
    }

    const personId = assertNonBlank(trimOrNull(subject.personId), "personId");
    const siteLocationId = assertNonBlank(trimOrNull(subject.siteLocationId), "siteLocationId");
    // Eligibility is canonical EMPLOYMENT, never persons.is_employee (a waitlist
    // household-priority flag). Same authority the database trigger enforces.
    await assertStaffPersonEligibleForAssignment(supabase, orgId, personId, onDate);
    return {
        siteLocationId,
        enrollmentAgreementId: null,
        customerMemberId: null,
        personId,
        commitmentKind: "committed",
    };
}

/**
 * Create one independent recurring commitment. It never changes an existing
 * commitment, and it refuses to replace a child's primary operational home.
 */
export async function createOperationalAssignment(
    supabase: SupabaseClient,
    input: CreateOperationalAssignmentInput
): Promise<ScheduleAssignmentRow> {
    const startDate = assertNonBlank(trimOrNull(input.startDate), "startDate");
    const schedulePatternId = assertNonBlank(trimOrNull(input.schedulePatternId), "schedulePatternId");
    assertValidIsoDate(startDate, "startDate");
    const endDate = trimOrNull(input.endDate);
    if (endDate) {
        assertValidIsoDate(endDate, "endDate");
        if (endDate < startDate) {
            throw new OperationalEnrollmentServiceError(
                "invalid_input",
                "endDate must be on or after startDate",
                { start_date: startDate, end_date: endDate }
            );
        }
    }

    const requestedKind: "proposed" | "committed" =
        input.commitmentKind ??
        (input.subject.type === "child" && !trimOrNull(input.subject.enrollmentAgreementId)
            ? "proposed"
            : "committed");

    const subject = await resolveSubjectSite(supabase, input.orgId, input.subject, requestedKind, startDate);
    const patternCheck = await validateSchedulePatternForSite(
        supabase,
        input.orgId,
        subject.siteLocationId,
        schedulePatternId
    );
    if (!patternCheck.ok) {
        throw new OperationalEnrollmentServiceError("validation_failed", patternCheck.error.message, {
            field: "schedule_pattern_id",
        });
    }

    /*
     * THE ROOM IS UNDER THE ASSIGNMENT'S SITE — the same ratified rule placements and staff coverage
     * already enforce (placement-system: "classroom under site"; staff-coverage-authority: a room must
     * resolve under the selected site). The database trigger checks only the org, so this writer let a
     * secondary or staff assignment name a room at another site — and a staff row's room is what
     * attendance capture scope resolves through. A STAFF room must also be an operational group
     * (attendance-system: staff assignment belongs to the operational_group unit). Whether a child's
     * secondary may sit in a shared space is not ratified, so it is not decided here.
     */
    const roomLocationId = trimOrNull(input.roomLocationId);
    if (roomLocationId) {
        const roomCheck = await validateRoomLocationUnderSite(supabase, input.orgId, subject.siteLocationId, roomLocationId);
        if (!roomCheck.ok) {
            throw new OperationalEnrollmentServiceError("validation_failed", roomCheck.error.message, {
                field: "room_location_id",
            });
        }
        if (input.subject.type === "staff") {
            const { data: unit, error: unitError } = await supabase
                .from("locations")
                .select("location_type, unit_role")
                .eq("org_id", input.orgId)
                .eq("id", roomLocationId)
                .maybeSingle();
            if (unitError) throw new OperationalEnrollmentServiceError("db_error", unitError.message);
            const role = canonicalUnitRoleFromStorage(
                (unit as { location_type?: unknown } | null)?.location_type,
                (unit as { unit_role?: unknown } | null)?.unit_role
            );
            if (!isOperationalGroupRole(role)) {
                throw new OperationalEnrollmentServiceError(
                    "validation_failed",
                    "A staff assignment's room must be a classroom (operational group)",
                    { field: "room_location_id" }
                );
            }
        }
    }

    const isPrimary = input.isPrimary === true;
    const supersedesAssignmentId = trimOrNull(input.supersedesAssignmentId);
    if (isPrimary && input.subject.type !== "child") {
        throw new OperationalEnrollmentServiceError("invalid_input", "Only a child assignment may be primary");
    }
    // Committed primary uniqueness only — proposed primaries are planning markers.
    if (isPrimary && !supersedesAssignmentId && subject.commitmentKind === "committed" && subject.enrollmentAgreementId) {
        const { data, error } = await supabase
            .from("schedule_assignments")
            .select("id")
            .eq("org_id", input.orgId)
            .eq("enrollment_agreement_id", subject.enrollmentAgreementId)
            .eq("subject_type", "child")
            .eq("commitment_kind", "committed")
            .eq("is_primary", true)
            .in("status", ["planned", "active", "ending"])
            .maybeSingle();
        if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
        if (data) {
            throw new OperationalEnrollmentServiceError(
                "conflict",
                "Child already has a primary assignment; use the primary-change command to supersede it",
                { assignment_id: (data as { id: string }).id }
            );
        }
    }

    /*
     * REPLACING A SECONDARY: ITS OWN SUBJECT'S ROW ONLY, AND NEVER A CLOSE WITHOUT A SUCCESSOR.
     *
     * This closed the prior row and THEN inserted its successor, in two calls with nothing between
     * them: any insert refusal (the consistency trigger — pattern or site mismatch, a room or program
     * outside the org, a category that does not support the subject, staff employment) left the
     * commitment closed and nothing in its place. And the prior row was found by id alone, so a
     * crafted id could close ANOTHER subject's assignment while the successor was written for this one.
     *
     * Now the prior row must belong to the subject being written, the successor is inserted FIRST,
     * and the prior row is closed only if it is still live (a concurrent edit that got there first
     * is a conflict, not a second successor). Should the close not land, the successor is removed —
     * the same compensation the primary path uses. Secondaries carry no uniqueness or overlap
     * constraint, so the instant both rows are live is invisible to every rule; it is NOT a
     * transaction, and a crash between the two calls leaves both rows live (visible and
     * recoverable) rather than the commitment lost. A truly atomic replacement needs a database
     * function — a decision, not something to slip in here.
     */
    let priorIsPrimary = isPrimary;
    let prior: ScheduleAssignmentRow | null = null;
    if (supersedesAssignmentId) {
        const { data: priorRaw, error: priorErr } = await supabase
            .from("schedule_assignments")
            .select("*")
            .eq("org_id", input.orgId)
            .eq("id", supersedesAssignmentId)
            .maybeSingle();
        if (priorErr) throw new OperationalEnrollmentServiceError("db_error", priorErr.message);
        prior = priorRaw as ScheduleAssignmentRow | null;
        if (!prior || !LIVE_STATUSES.includes(prior.status) || !priorBelongsToSubject(prior, input.subject.type, subject)) {
            throw new OperationalEnrollmentServiceError("not_found", "Assignment to supersede was not found");
        }
        if (prior.is_primary === true) {
            throw new OperationalEnrollmentServiceError(
                "invalid_state",
                "Primary assignment edits must use the primary schedule path or assignment.set_primary"
            );
        }
        priorIsPrimary = false;
    }

    const row = {
        org_id: input.orgId,
        subject_type: input.subject.type,
        enrollment_agreement_id: subject.enrollmentAgreementId,
        customer_member_id: subject.customerMemberId,
        subject_person_id: subject.personId,
        site_location_id: subject.siteLocationId,
        room_location_id: roomLocationId,
        program_category_id: trimOrNull(input.programCategoryId),
        operational_assignment_type_id: trimOrNull(input.assignmentTypeId),
        is_primary: supersedesAssignmentId ? priorIsPrimary : isPrimary,
        commitment_kind: subject.commitmentKind,
        schedule_pattern_id: schedulePatternId,
        start_date: startDate,
        end_date: endDate,
        // Proposed rows stay in planned status for operator clarity even when start ≤ today.
        status:
            subject.commitmentKind === "proposed"
                ? "planned"
                : derivePlacementStatusFromStartDate(startDate, input.todayYmd),
        assignment_kind: "base",
        source_key: trimOrNull(input.sourceKey) ?? "operator",
        supersedes_assignment_id: supersedesAssignmentId,
        metadata: {
            ...(input.metadata ?? {}),
            ...(subject.commitmentKind === "proposed" ? { planning: true } : {}),
        },
        created_by: trimOrNull(input.actorUserId),
        updated_by: trimOrNull(input.actorUserId),
    };

    const { data, error } = await supabase.from("schedule_assignments").insert(row).select("*").single();
    if (error || !data) {
        throw new OperationalEnrollmentServiceError("db_error", error?.message ?? "Could not create assignment");
    }
    const created = data as ScheduleAssignmentRow;
    if (prior) {
        const { data: closed, error: closeError } = await supabase
            .from("schedule_assignments")
            .update({
                status: "superseded",
                end_date: computePriorRowCloseDate(startDate),
                updated_by: trimOrNull(input.actorUserId),
            })
            .eq("org_id", input.orgId)
            .eq("id", prior.id)
            .in("status", LIVE_STATUSES)
            .select("id")
            .maybeSingle();
        if (closeError || !closed) {
            await supabase.from("schedule_assignments").delete().eq("org_id", input.orgId).eq("id", created.id);
            if (closeError) throw new OperationalEnrollmentServiceError("db_error", closeError.message);
            throw new OperationalEnrollmentServiceError(
                "conflict",
                "This assignment was changed by someone else — reopen it and try again",
                { assignment_id: prior.id }
            );
        }
    }
    return created;
}

const LIVE_STATUSES = ["planned", "active", "ending"];

/**
 * The prior row is this subject's: same subject type and the same child (by member, or by agreement
 * for rows written before members were carried) or the same staff person.
 */
function priorBelongsToSubject(
    prior: ScheduleAssignmentRow,
    subjectType: string,
    subject: { customerMemberId: string | null; personId: string | null; enrollmentAgreementId: string | null }
): boolean {
    if (prior.subject_type !== subjectType) return false;
    if (subjectType !== "child") return Boolean(subject.personId) && prior.subject_person_id === subject.personId;
    return (
        (Boolean(subject.customerMemberId) && prior.customer_member_id === subject.customerMemberId) ||
        (Boolean(subject.enrollmentAgreementId) && prior.enrollment_agreement_id === subject.enrollmentAgreementId)
    );
}

export async function listOperationalAssignments(
    supabase: SupabaseClient,
    orgId: string,
    filters: ListOperationalAssignmentFilters = {}
): Promise<ScheduleAssignmentRow[]> {
    let query = supabase.from("schedule_assignments").select("*").eq("org_id", orgId);
    if (filters.subject?.type === "child") {
        query = query.eq("subject_type", "child");
        const memberId = trimOrNull(filters.subject.customerMemberId);
        const agreementId = trimOrNull(filters.subject.enrollmentAgreementId);
        if (memberId) {
            query = query.eq("customer_member_id", memberId);
        } else if (agreementId) {
            query = query.eq("enrollment_agreement_id", agreementId);
        }
    }
    if (filters.subject?.type === "staff") {
        query = query.eq("subject_type", "staff").eq("subject_person_id", filters.subject.personId);
    }
    if (filters.includeProposed === false) {
        query = query.eq("commitment_kind", "committed");
    }
    if (!filters.includeTerminal) query = query.in("status", ["planned", "active", "ending"]);
    const { data, error } = await query.order("start_date", { ascending: true });
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    return (data ?? []) as ScheduleAssignmentRow[];
}

/**
 * Promote a proposed (planning) assignment onto a live enrollment agreement.
 * Same row id — no duplicate commitment.
 */
export async function promoteProposedAssignment(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        assignmentId: string;
        enrollmentAgreementId: string;
        actorUserId?: string | null;
    }
): Promise<ScheduleAssignmentRow> {
    const agreementId = assertNonBlank(trimOrNull(input.enrollmentAgreementId), "enrollment");
    const agreement = await getAgreementById(supabase, input.orgId, agreementId);
    if (!agreement) {
        throw new OperationalEnrollmentServiceError("not_found", "Enrollment agreement not found");
    }
    if (agreement.status === "canceled" || agreement.status === "ended") {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            "Cannot promote onto a terminal enrollment agreement"
        );
    }

    const { data: priorRaw, error: loadErr } = await supabase
        .from("schedule_assignments")
        .select("*")
        .eq("org_id", input.orgId)
        .eq("id", input.assignmentId)
        .maybeSingle();
    if (loadErr) throw new OperationalEnrollmentServiceError("db_error", loadErr.message);
    const prior = priorRaw as ScheduleAssignmentRow | null;
    if (!prior || prior.subject_type !== "child") {
        throw new OperationalEnrollmentServiceError("not_found", "Proposed assignment not found");
    }
    if ((prior.commitment_kind ?? "committed") !== "proposed") {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            "Only a Proposed Assignment can be promoted"
        );
    }
    if (prior.customer_member_id !== agreement.customer_member_id) {
        throw new OperationalEnrollmentServiceError(
            "validation_failed",
            "This Proposed Assignment belongs to a different child than the enrollment"
        );
    }

    const meta =
        prior.metadata && typeof prior.metadata === "object" ? { ...(prior.metadata as object) } : {};
    const { data, error } = await supabase
        .from("schedule_assignments")
        .update({
            enrollment_agreement_id: agreement.id,
            site_location_id: agreement.site_location_id ?? prior.site_location_id,
            commitment_kind: "committed",
            status: prior.status === "planned" ? "active" : prior.status,
            metadata: {
                ...meta,
                promoted_from_proposed_at: new Date().toISOString(),
                planning: false,
            },
            updated_by: trimOrNull(input.actorUserId),
        })
        .eq("org_id", input.orgId)
        .eq("id", prior.id)
        .select("*")
        .single();
    if (error || !data) {
        throw new OperationalEnrollmentServiceError("db_error", error?.message ?? "Could not promote assignment");
    }
    return data as ScheduleAssignmentRow;
}

/**
 * Delete a Proposed (planning-only) assignment — the operator wants it removed from
 * planning projections entirely, not just ended. Hard delete: Proposed rows carry no
 * agreement, no attendance/billing history, and no primary-uniqueness invariant, so
 * there is no downstream truth to preserve. Committed rows can NEVER be deleted here —
 * use `archiveOperationalAssignment` (or a supersede) for committed truth. Callers must
 * write an `action_executed` audit event (the row itself no longer exists to derive
 * history from — see `assignmentDeleteProposedAction`).
 */
export async function deleteProposedOperationalAssignment(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        assignmentId: string;
        actorUserId?: string | null;
    }
): Promise<ScheduleAssignmentRow> {
    const assignmentId = assertNonBlank(trimOrNull(input.assignmentId), "assignmentId");

    const { data, error } = await supabase
        .from("schedule_assignments")
        .select("*")
        .eq("org_id", input.orgId)
        .eq("id", assignmentId)
        .maybeSingle();
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    const row = data as ScheduleAssignmentRow | null;
    if (!row) {
        throw new OperationalEnrollmentServiceError("not_found", "Proposed assignment not found");
    }
    if ((row.commitment_kind ?? "committed") !== "proposed") {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            "Only a Proposed Assignment can be deleted; committed assignments must be archived or superseded"
        );
    }

    const { error: deleteError } = await supabase
        .from("schedule_assignments")
        .delete()
        .eq("org_id", input.orgId)
        .eq("id", assignmentId);
    if (deleteError) {
        throw new OperationalEnrollmentServiceError("db_error", deleteError.message);
    }
    return row;
}
