import type { SupabaseClient } from "@supabase/supabase-js";
import { derivePlacementStatusFromStartDate } from "@/lib/childcareOperational/enrollmentOperationalStatus";
import type { ScheduleAssignmentRow } from "@/lib/childcareOperational/enrollmentOperationalTypes";
import {
    assertValidIsoDate,
    computePriorRowCloseDate,
    isInvalidSupersedeStartDate,
    validateEndOnOrAfterStart,
} from "@/lib/childcareOperational/effectiveDating";
import { getAgreementById } from "@/lib/childcareOperational/enrollmentAgreementService";
import {
    OperationalEnrollmentServiceError,
    trimOrNull,
} from "@/lib/childcareOperational/operationalEnrollmentErrors";
import { validateSchedulePatternForSite } from "@/lib/childcareOperational/validateChildcareLocationRefs";
import {
    emitScheduleAssignmentChangedEvent,
    HANDOFF_SOURCE_KEY,
} from "@/lib/childcareOperational/operationalEnrollmentEvents";

function isOperatorEnrollmentEditSource(sourceKey: string | null | undefined): boolean {
    const k = trimOrNull(sourceKey) ?? "operator";
    return k !== HANDOFF_SOURCE_KEY;
}

async function emitOperatorScheduleChangedIfNeeded(
    input: CreateScheduleAssignmentInput,
    assignment: ScheduleAssignmentRow,
    prior?: { id: string; closeDate?: string | null }
): Promise<void> {
    if (!isOperatorEnrollmentEditSource(input.sourceKey)) return;
    await emitScheduleAssignmentChangedEvent({
        orgId: input.orgId,
        assignmentId: assignment.id,
        enrollmentAgreementId: assignment.enrollment_agreement_id!,
        schedulePatternId: assignment.schedule_pattern_id,
        customerMemberId: assignment.customer_member_id!,
        startDate: assignment.start_date,
        supersedesAssignmentId: prior?.id ?? assignment.supersedes_assignment_id,
        priorAssignmentCloseDate: prior?.closeDate ?? null,
        sourceKey: assignment.source_key,
        ctx: { actorUserId: input.actorUserId },
    });
}

export type CreateScheduleAssignmentInput = {
    orgId: string;
    enrollmentAgreementId: string;
    schedulePatternId: string;
    startDate: string;
    sourceKey?: string;
    metadata?: Record<string, unknown>;
    actorUserId?: string | null;
    todayYmd: string;
};

export type SupersedeScheduleAssignmentInput = CreateScheduleAssignmentInput;

export async function getOperationalScheduleAssignmentForAgreement(
    supabase: SupabaseClient,
    orgId: string,
    enrollmentAgreementId: string
): Promise<ScheduleAssignmentRow | null> {
    const { data, error } = await supabase
        .from("schedule_assignments")
        .select("*")
        .eq("org_id", orgId)
        .eq("subject_type", "child")
        .eq("enrollment_agreement_id", enrollmentAgreementId)
        .eq("is_primary", true)
        .in("status", ["planned", "active", "ending"])
        .maybeSingle();

    if (error) {
        throw new OperationalEnrollmentServiceError("db_error", error.message);
    }
    return data ? (data as ScheduleAssignmentRow) : null;
}

export type ListScheduleAssignmentsFilters = {
    enrollmentAgreementId?: string;
    customerMemberId?: string;
    /**
     * A STAFF subject's person. `schedule_assignments` is shared by children and staff on purpose
     * (`operationalAssignmentService` extended it in place rather than growing a second scheduling
     * engine), so reading a staff member's assignments is a filter on this table, never another one.
     */
    subjectPersonId?: string;
    /**
     * Carried EXPLICITLY rather than inferred from `subjectPersonId` being present, for the same
     * reason `loadSubjectContexts` carries it: a child WITH a linked person would otherwise match a
     * staff query, and the failure would be a plausible wrong answer rather than an error.
     */
    subjectType?: "child" | "staff";
};

export async function listScheduleAssignments(
    supabase: SupabaseClient,
    orgId: string,
    filters: ListScheduleAssignmentsFilters = {}
): Promise<ScheduleAssignmentRow[]> {
    let q = supabase.from("schedule_assignments").select("*").eq("org_id", orgId);

    if (filters.enrollmentAgreementId) {
        q = q.eq("enrollment_agreement_id", filters.enrollmentAgreementId);
    }
    if (filters.customerMemberId) {
        q = q.eq("customer_member_id", filters.customerMemberId);
    }
    if (filters.subjectPersonId) {
        q = q.eq("subject_person_id", filters.subjectPersonId);
    }
    if (filters.subjectType) {
        q = q.eq("subject_type", filters.subjectType);
    }

    q = q.order("start_date", { ascending: false });

    const { data, error } = await q;
    if (error) {
        throw new OperationalEnrollmentServiceError("db_error", error.message);
    }
    return (data ?? []) as ScheduleAssignmentRow[];
}

async function assertAgreementAllowsScheduleAssignment(
    supabase: SupabaseClient,
    orgId: string,
    enrollmentAgreementId: string
) {
    const agreement = await getAgreementById(supabase, orgId, enrollmentAgreementId);
    if (!agreement) {
        throw new OperationalEnrollmentServiceError("not_found", "Enrollment agreement not found");
    }
    if (agreement.status === "canceled" || agreement.status === "ended") {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            "Cannot modify schedule assignments on a terminal agreement",
            { status: agreement.status }
        );
    }
    return agreement;
}

export async function createInitialScheduleAssignment(
    supabase: SupabaseClient,
    input: CreateScheduleAssignmentInput
): Promise<ScheduleAssignmentRow> {
    const agreement = await assertAgreementAllowsScheduleAssignment(
        supabase,
        input.orgId,
        input.enrollmentAgreementId
    );

    const existing = await getOperationalScheduleAssignmentForAgreement(
        supabase,
        input.orgId,
        input.enrollmentAgreementId
    );
    if (existing) {
        throw new OperationalEnrollmentServiceError(
            "conflict",
            "An operational schedule assignment already exists; use supersede",
            { assignment_id: existing.id }
        );
    }

    const startDate = trimOrNull(input.startDate);
    const schedulePatternId = trimOrNull(input.schedulePatternId);
    if (!startDate || !schedulePatternId) {
        throw new OperationalEnrollmentServiceError(
            "invalid_input",
            "startDate and schedulePatternId are required"
        );
    }
    assertValidIsoDate(startDate, "startDate");

    const patternCheck = await validateSchedulePatternForSite(
        supabase,
        input.orgId,
        agreement.site_location_id,
        schedulePatternId
    );
    if (!patternCheck.ok) {
        throw new OperationalEnrollmentServiceError("validation_failed", patternCheck.error.message, {
            field: "schedule_pattern_id",
        });
    }

    const status = derivePlacementStatusFromStartDate(startDate, input.todayYmd);

    const row = {
        org_id: input.orgId,
        subject_type: "child",
        enrollment_agreement_id: input.enrollmentAgreementId,
        schedule_pattern_id: schedulePatternId,
        customer_member_id: agreement.customer_member_id,
        subject_person_id: null,
        is_primary: true,
        start_date: startDate,
        end_date: null,
        status,
        assignment_kind: "base",
        source_key: trimOrNull(input.sourceKey) ?? "operator",
        supersedes_assignment_id: null,
        metadata: input.metadata ?? {},
        created_by: trimOrNull(input.actorUserId),
        updated_by: trimOrNull(input.actorUserId),
    };

    const { data, error } = await supabase
        .from("schedule_assignments")
        .insert(row)
        .select("*")
        .single();

    if (error || !data) {
        throw new OperationalEnrollmentServiceError("db_error", error?.message ?? "insert failed");
    }
    const assignment = data as ScheduleAssignmentRow;
    if (
        assignment.subject_type !== "child" ||
        !assignment.enrollment_agreement_id ||
        !assignment.customer_member_id
    ) {
        throw new OperationalEnrollmentServiceError("db_error", "Created assignment has an invalid child subject shape");
    }
    await emitOperatorScheduleChangedIfNeeded(input, assignment);
    return assignment;
}

export async function supersedeScheduleAssignment(
    supabase: SupabaseClient,
    input: SupersedeScheduleAssignmentInput
): Promise<ScheduleAssignmentRow> {
    const agreement = await assertAgreementAllowsScheduleAssignment(
        supabase,
        input.orgId,
        input.enrollmentAgreementId
    );

    const prior = await getOperationalScheduleAssignmentForAgreement(
        supabase,
        input.orgId,
        input.enrollmentAgreementId
    );
    if (!prior) {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            "No operational schedule assignment to supersede; use createInitialScheduleAssignment"
        );
    }

    const newStartDate = trimOrNull(input.startDate);
    const schedulePatternId = trimOrNull(input.schedulePatternId);
    if (!newStartDate || !schedulePatternId) {
        throw new OperationalEnrollmentServiceError(
            "invalid_input",
            "startDate and schedulePatternId are required"
        );
    }
    assertValidIsoDate(newStartDate, "startDate");

    if (
        isInvalidSupersedeStartDate({
            priorStartDate: prior.start_date,
            priorEndDate: prior.end_date,
            newStartDate,
        })
    ) {
        throw new OperationalEnrollmentServiceError(
            "validation_failed",
            "new start_date must be after prior assignment start and any prior end_date"
        );
    }

    const patternCheck = await validateSchedulePatternForSite(
        supabase,
        input.orgId,
        agreement.site_location_id,
        schedulePatternId
    );
    if (!patternCheck.ok) {
        throw new OperationalEnrollmentServiceError("validation_failed", patternCheck.error.message, {
            field: "schedule_pattern_id",
        });
    }

    const closeDate = computePriorRowCloseDate(newStartDate);
    const rangeError = validateEndOnOrAfterStart(prior.start_date, closeDate);
    if (rangeError) {
        throw new OperationalEnrollmentServiceError("validation_failed", rangeError.message);
    }

    const { error: closeError } = await supabase
        .from("schedule_assignments")
        .update({
            status: "superseded",
            end_date: closeDate,
            updated_by: trimOrNull(input.actorUserId),
        })
        .eq("org_id", input.orgId)
        .eq("id", prior.id);

    if (closeError) {
        throw new OperationalEnrollmentServiceError("db_error", closeError.message);
    }

    const status = derivePlacementStatusFromStartDate(newStartDate, input.todayYmd);

    const row = {
        org_id: input.orgId,
        subject_type: "child",
        enrollment_agreement_id: input.enrollmentAgreementId,
        schedule_pattern_id: schedulePatternId,
        customer_member_id: agreement.customer_member_id,
        subject_person_id: null,
        is_primary: true,
        start_date: newStartDate,
        end_date: null,
        status,
        assignment_kind: "base",
        source_key: trimOrNull(input.sourceKey) ?? "operator",
        supersedes_assignment_id: prior.id,
        metadata: input.metadata ?? {},
        created_by: trimOrNull(input.actorUserId),
        updated_by: trimOrNull(input.actorUserId),
    };

    const { data, error } = await supabase
        .from("schedule_assignments")
        .insert(row)
        .select("*")
        .single();

    if (error || !data) {
        throw new OperationalEnrollmentServiceError("db_error", error?.message ?? "insert failed");
    }
    const assignment = data as ScheduleAssignmentRow;
    if (
        assignment.subject_type !== "child" ||
        !assignment.enrollment_agreement_id ||
        !assignment.customer_member_id
    ) {
        throw new OperationalEnrollmentServiceError("db_error", "Superseded assignment has an invalid child subject shape");
    }
    await emitOperatorScheduleChangedIfNeeded(input, assignment, {
        id: prior.id,
        closeDate: closeDate,
    });
    return assignment;
}

export function assertNoOperationalScheduleAssignmentPatch(): void {
    throw new OperationalEnrollmentServiceError(
        "invalid_input",
        "Operational schedule changes must use supersedeScheduleAssignment, not update-in-place"
    );
}
