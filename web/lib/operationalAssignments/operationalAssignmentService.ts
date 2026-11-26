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
import { assertValidIsoDate } from "@/lib/childcareOperational/effectiveDating";
import { getAgreementById } from "@/lib/childcareOperational/enrollmentAgreementService";
import { validateRoomLocationUnderSite, validateSchedulePatternForSite } from "@/lib/childcareOperational/validateChildcareLocationRefs";
import { assertSpaceEligibleForAssignment } from "@/lib/operationalAssignments/assertSpaceEligible";
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
    /** Idempotency for a replacement: a retry with the same key replays instead of chaining a successor. */
    replacementKey?: string | null;
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
     * (attendance-system: staff assignment belongs to the operational_group unit). Which spaces a
     * child's schedule may use is the space's own configuration (V7 S1/S2), via spaceEligibleForUse.
     */
    const roomLocationId = trimOrNull(input.roomLocationId);
    if (roomLocationId) {
        const roomCheck = await validateRoomLocationUnderSite(supabase, input.orgId, subject.siteLocationId, roomLocationId);
        if (!roomCheck.ok) {
            throw new OperationalEnrollmentServiceError("validation_failed", roomCheck.error.message, {
                field: "room_location_id",
            });
        }
        // The space's structure and configured uses (V7-02a) — one rule with the pickers and
        // Rooms configuration; staff rooms stay classrooms-only through the same rule.
        await assertSpaceEligibleForAssignment(supabase, {
            orgId: input.orgId,
            roomLocationId,
            categoryId: trimOrNull(input.assignmentTypeId),
            subjectType: input.subject.type,
            supersedesAssignmentId: trimOrNull(input.supersedesAssignmentId),
        });
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
        is_primary: supersedesAssignmentId ? false : isPrimary,
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

    if (supersedesAssignmentId) return replaceSecondaryAssignment(supabase, input, subject, row, supersedesAssignmentId);

    const { data, error } = await supabase.from("schedule_assignments").insert(row).select("*").single();
    if (error || !data) {
        throw new OperationalEnrollmentServiceError("db_error", error?.message ?? "Could not create assignment");
    }
    return data as ScheduleAssignmentRow;
}

/*
 * REPLACING A SECONDARY IS ONE TRANSACTION: `replace_secondary_schedule_assignment`.
 *
 * The predecessor is locked, bound to this subject and site, closed and succeeded inside one database
 * transaction — a refused successor (the consistency trigger included) rolls the close back with it,
 * and concurrent replacements serialise on the predecessor's lock. A retry carrying the same
 * replacement key is answered with the successor it already created; any other request against a
 * superseded predecessor is stale. This service still resolves the subject, validates pattern and
 * room and builds the successor; the function decides nothing about category or overlap.
 */
async function replaceSecondaryAssignment(
    supabase: SupabaseClient,
    input: CreateOperationalAssignmentInput,
    subject: { customerMemberId: string | null; personId: string | null; enrollmentAgreementId: string | null },
    row: Record<string, unknown>,
    priorId: string
): Promise<ScheduleAssignmentRow> {
    // Deterministic for the same intent, so a resubmitted identical request replays rather than chains.
    const replacementKey =
        trimOrNull(input.replacementKey) ??
        ["r", priorId, row.start_date, row.end_date, row.schedule_pattern_id, row.room_location_id,
            row.operational_assignment_type_id, row.program_category_id].map((v) => String(v ?? "")).join(":");
    const { data, error } = await supabase.rpc("replace_secondary_schedule_assignment", {
        p_org_id: input.orgId,
        p_prior_assignment_id: priorId,
        p_subject_type: input.subject.type,
        p_customer_member_id: subject.customerMemberId,
        p_enrollment_agreement_id: subject.enrollmentAgreementId,
        p_subject_person_id: subject.personId,
        p_replacement_key: replacementKey,
        p_actor: trimOrNull(input.actorUserId),
        p_successor: {
            site_location_id: row.site_location_id,
            room_location_id: row.room_location_id,
            program_category_id: row.program_category_id,
            operational_assignment_type_id: row.operational_assignment_type_id,
            schedule_pattern_id: row.schedule_pattern_id,
            start_date: row.start_date,
            end_date: row.end_date,
            status: row.status,
            commitment_kind: row.commitment_kind,
            assignment_kind: row.assignment_kind,
            source_key: row.source_key,
            metadata: row.metadata,
        },
    });
    if (error) throw replacementRefusal(error.message, priorId);
    const successor = (data as { successor?: ScheduleAssignmentRow } | null)?.successor;
    if (!successor) throw new OperationalEnrollmentServiceError("db_error", "Replacement returned no successor");
    return successor;
}

/** The function's refusals, in this service's vocabulary. */
function replacementRefusal(message: string, priorId: string): OperationalEnrollmentServiceError {
    const m = message ?? "";
    if (m.includes("prior_not_found")) return new OperationalEnrollmentServiceError("not_found", "Assignment to supersede was not found");
    if (m.includes("primary_not_supported")) {
        return new OperationalEnrollmentServiceError(
            "invalid_state",
            "Primary assignment edits must use the primary schedule path or assignment.set_primary"
        );
    }
    if (m.includes("stale_predecessor")) {
        return new OperationalEnrollmentServiceError(
            "conflict",
            "This assignment was changed by someone else — reopen it and try again",
            { assignment_id: priorId }
        );
    }
    if (m.includes("site_mismatch") || m.includes("invalid_successor_start")) {
        return new OperationalEnrollmentServiceError("validation_failed", m, { assignment_id: priorId });
    }
    return new OperationalEnrollmentServiceError("db_error", m);
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
