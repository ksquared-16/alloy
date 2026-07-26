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
import { validateSchedulePatternForSite } from "@/lib/childcareOperational/validateChildcareLocationRefs";

export type OperationalAssignmentSubject =
    | {
          type: "child";
          enrollmentAgreementId: string;
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
    roomLocationId?: string | null;
    programCategoryId?: string | null;
    assignmentTypeId?: string | null;
    /**
     * Only child assignments may be primary. A primary change must supersede
     * the prior primary through a dedicated command; this create operation
     * cannot silently replace an operational home.
     */
    isPrimary?: boolean;
    /**
     * When set, close this prior operational assignment (effective-dated supersede)
     * and insert the new row. Used for Edit Assignment on a secondary commitment.
     * Primary home changes still use `assignment.set_primary`.
     */
    supersedesAssignmentId?: string | null;
    sourceKey?: string;
    metadata?: Record<string, unknown>;
    actorUserId?: string | null;
    todayYmd: string;
};

export type ListOperationalAssignmentFilters = {
    subject?: OperationalAssignmentSubject;
    includeTerminal?: boolean;
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
    subject: OperationalAssignmentSubject
): Promise<{ siteLocationId: string; enrollmentAgreementId: string | null; customerMemberId: string | null; personId: string | null }> {
    if (subject.type === "child") {
        const enrollmentAgreementId = assertNonBlank(trimOrNull(subject.enrollmentAgreementId), "enrollmentAgreementId");
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
        };
    }

    const personId = assertNonBlank(trimOrNull(subject.personId), "personId");
    const siteLocationId = assertNonBlank(trimOrNull(subject.siteLocationId), "siteLocationId");
    const { data, error } = await supabase
        .from("persons")
        .select("id, org_id, is_employee, archived_at")
        .eq("org_id", orgId)
        .eq("id", personId)
        .maybeSingle();
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    const person = data as { id: string; is_employee: boolean | null; archived_at: string | null } | null;
    if (!person || person.is_employee !== true || person.archived_at != null) {
        throw new OperationalEnrollmentServiceError(
            "validation_failed",
            "Staff assignments require an active employee person",
            { person_id: personId }
        );
    }
    return { siteLocationId, enrollmentAgreementId: null, customerMemberId: null, personId };
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

    const subject = await resolveSubjectSite(supabase, input.orgId, input.subject);
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

    const isPrimary = input.isPrimary === true;
    const supersedesAssignmentId = trimOrNull(input.supersedesAssignmentId);
    if (isPrimary && input.subject.type !== "child") {
        throw new OperationalEnrollmentServiceError("invalid_input", "Only a child assignment may be primary");
    }
    if (isPrimary && !supersedesAssignmentId) {
        const { data, error } = await supabase
            .from("schedule_assignments")
            .select("id")
            .eq("org_id", input.orgId)
            .eq("enrollment_agreement_id", subject.enrollmentAgreementId)
            .eq("subject_type", "child")
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

    let priorIsPrimary = isPrimary;
    if (supersedesAssignmentId) {
        const { data: priorRaw, error: priorErr } = await supabase
            .from("schedule_assignments")
            .select("*")
            .eq("org_id", input.orgId)
            .eq("id", supersedesAssignmentId)
            .maybeSingle();
        if (priorErr) throw new OperationalEnrollmentServiceError("db_error", priorErr.message);
        const prior = priorRaw as ScheduleAssignmentRow | null;
        if (!prior || !["planned", "active", "ending"].includes(prior.status)) {
            throw new OperationalEnrollmentServiceError("not_found", "Assignment to supersede was not found");
        }
        if (prior.is_primary === true) {
            throw new OperationalEnrollmentServiceError(
                "invalid_state",
                "Primary assignment edits must use the primary schedule path or assignment.set_primary"
            );
        }
        priorIsPrimary = false;
        const closeDate = computePriorRowCloseDate(startDate);
        const { error: closeError } = await supabase
            .from("schedule_assignments")
            .update({
                status: "superseded",
                end_date: closeDate,
                updated_by: trimOrNull(input.actorUserId),
            })
            .eq("org_id", input.orgId)
            .eq("id", prior.id);
        if (closeError) throw new OperationalEnrollmentServiceError("db_error", closeError.message);
    }

    const row = {
        org_id: input.orgId,
        subject_type: input.subject.type,
        enrollment_agreement_id: subject.enrollmentAgreementId,
        customer_member_id: subject.customerMemberId,
        subject_person_id: subject.personId,
        site_location_id: subject.siteLocationId,
        room_location_id: trimOrNull(input.roomLocationId),
        program_category_id: trimOrNull(input.programCategoryId),
        operational_assignment_type_id: trimOrNull(input.assignmentTypeId),
        is_primary: supersedesAssignmentId ? priorIsPrimary : isPrimary,
        schedule_pattern_id: schedulePatternId,
        start_date: startDate,
        end_date: null,
        status: derivePlacementStatusFromStartDate(startDate, input.todayYmd),
        assignment_kind: "base",
        source_key: trimOrNull(input.sourceKey) ?? "operator",
        supersedes_assignment_id: supersedesAssignmentId,
        metadata: input.metadata ?? {},
        created_by: trimOrNull(input.actorUserId),
        updated_by: trimOrNull(input.actorUserId),
    };

    const { data, error } = await supabase.from("schedule_assignments").insert(row).select("*").single();
    if (error || !data) {
        throw new OperationalEnrollmentServiceError("db_error", error?.message ?? "Could not create assignment");
    }
    return data as ScheduleAssignmentRow;
}

export async function listOperationalAssignments(
    supabase: SupabaseClient,
    orgId: string,
    filters: ListOperationalAssignmentFilters = {}
): Promise<ScheduleAssignmentRow[]> {
    let query = supabase.from("schedule_assignments").select("*").eq("org_id", orgId);
    if (filters.subject?.type === "child") {
        query = query
            .eq("subject_type", "child")
            .eq("enrollment_agreement_id", filters.subject.enrollmentAgreementId);
    }
    if (filters.subject?.type === "staff") {
        query = query.eq("subject_type", "staff").eq("subject_person_id", filters.subject.personId);
    }
    if (!filters.includeTerminal) query = query.in("status", ["planned", "active", "ending"]);
    const { data, error } = await query.order("start_date", { ascending: true });
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    return (data ?? []) as ScheduleAssignmentRow[];
}
