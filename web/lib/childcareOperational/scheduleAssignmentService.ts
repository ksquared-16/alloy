import type { SupabaseClient } from "@supabase/supabase-js";
import {
    derivePlacementStatusFromStartDate,
    isPlacementOperationalStatus,
} from "@/lib/childcareOperational/enrollmentOperationalStatus";
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
import {
    applyParticipationOperationalChange,
    deriveParticipationIdempotencyKey,
} from "@/lib/childcareOperational/participationOperationalChange";
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

export type SupersedeScheduleAssignmentInput = CreateScheduleAssignmentInput & {
    /**
     * Retry protection. Omitted, it is derived from the requested end state, so an operator
     * double-submit replays rather than superseding the first successor and chaining a spurious row.
     */
    idempotencyKey?: string;
    /**
     * The assignment the caller believes is current. Omitted, the row this call just read is used, so
     * a concurrent change surfaces as a conflict the caller can act on rather than a silent branch.
     */
    expectedAssignmentId?: string | null;
};

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

/**
 * The scheduling decision half of an assignment supersession, without the writing.
 *
 * Extracted so a COMBINED placement+assignment edit reuses exactly this validation before ONE
 * transactional call, rather than a parallel copy that drifts.
 */
export type ResolvedAssignmentSupersession = {
    prior: ScheduleAssignmentRow;
    newStartDate: string;
    schedulePatternId: string;
};

export async function resolveAssignmentSupersession(
    supabase: SupabaseClient,
    input: SupersedeScheduleAssignmentInput
): Promise<ResolvedAssignmentSupersession> {
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

    return { prior, newStartDate, schedulePatternId };
}

/**
 * The assignment payload this service sends to the one transactional persistence primitive.
 *
 * Deliberately narrow: room, site, program category, assignment type and commitment kind are NOT sent,
 * because no scheduling intent here distinguishes them. The primitive carries them forward from the
 * prior row (migration 20261109120000), which is why superseding no longer drops the child's room.
 */
export function assignmentChangePayload(
    input: SupersedeScheduleAssignmentInput,
    resolved: ResolvedAssignmentSupersession
) {
    return {
        startDate: resolved.newStartDate,
        schedulePatternId: resolved.schedulePatternId,
        sourceKey: trimOrNull(input.sourceKey) ?? "operator",
        metadata: input.metadata ?? {},
    };
}

export function assignmentIdempotencyKey(
    input: SupersedeScheduleAssignmentInput,
    resolved: ResolvedAssignmentSupersession
): string {
    return (
        input.idempotencyKey
        ?? deriveParticipationIdempotencyKey({
            scope: "assignment",
            enrollmentAgreementId: input.enrollmentAgreementId,
            values: [resolved.newStartDate, resolved.schedulePatternId],
        })
    );
}

export async function readAssignmentById(
    supabase: SupabaseClient,
    orgId: string,
    assignmentId: string
): Promise<ScheduleAssignmentRow> {
    const { data, error } = await supabase
        .from("schedule_assignments")
        .select("*")
        .eq("org_id", orgId)
        .eq("id", assignmentId)
        .single();
    if (error || !data) {
        throw new OperationalEnrollmentServiceError(
            "db_error",
            error?.message ?? "assignment successor not readable"
        );
    }
    const assignment = data as ScheduleAssignmentRow;
    if (
        assignment.subject_type !== "child"
        || !assignment.enrollment_agreement_id
        || !assignment.customer_member_id
    ) {
        throw new OperationalEnrollmentServiceError(
            "db_error",
            "Superseded assignment has an invalid child subject shape"
        );
    }
    return assignment;
}

/** Emits the canonical scheduling change event. Call only AFTER a successful commit. */
export async function emitAssignmentSupersededEvent(
    input: SupersedeScheduleAssignmentInput,
    assignment: ScheduleAssignmentRow,
    prior: { id: string; closeDate: string | null }
): Promise<void> {
    await emitOperatorScheduleChangedIfNeeded(input, assignment, prior);
}

/**
 * Re-reads the current operational assignment after a conflict and decides whether the caller's intent
 * is already satisfied.
 *
 * Losing a race is evidence someone got there first, not an error a partner should have to interpret.
 * Shared with the combined-edit command so both paths converge identically.
 */
export async function convergeAssignmentConflict(
    supabase: SupabaseClient,
    input: SupersedeScheduleAssignmentInput,
    resolved: ResolvedAssignmentSupersession,
    original: unknown
): Promise<ScheduleAssignmentRow> {
    const winner = await getOperationalScheduleAssignmentForAgreement(
        supabase,
        input.orgId,
        input.enrollmentAgreementId
    );
    if (
        winner
        && winner.schedule_pattern_id === resolved.schedulePatternId
        && winner.start_date === resolved.newStartDate
    ) {
        return winner;
    }
    if (winner) {
        throw new OperationalEnrollmentServiceError(
            "conflict",
            "Another schedule change for this enrollment was committed first; re-read it before changing again",
            { assignment_id: winner.id }
        );
    }
    throw original;
}

export async function supersedeScheduleAssignment(
    supabase: SupabaseClient,
    input: SupersedeScheduleAssignmentInput
): Promise<ScheduleAssignmentRow> {
    const resolved = await resolveAssignmentSupersession(supabase, input);

    // PERSISTENCE IS ONE TRANSACTION, OWNED BY THE DATABASE.
    //
    // Through the same primitive as the Placement service, deliberately: a second temporal engine is
    // exactly what the doctrine exists to prevent.
    let change: Awaited<ReturnType<typeof applyParticipationOperationalChange>>;
    try {
        change = await applyParticipationOperationalChange(supabase, {
            orgId: input.orgId,
            enrollmentAgreementId: input.enrollmentAgreementId,
            idempotencyKey: assignmentIdempotencyKey(input, resolved),
            todayYmd: input.todayYmd,
            actorUserId: trimOrNull(input.actorUserId),
            expectedAssignmentId: input.expectedAssignmentId ?? resolved.prior.id,
            assignment: assignmentChangePayload(input, resolved),
        });
    } catch (e) {
        /*
         * RACE RECOVERY, PRESERVED — only the DETECTION changed.
         *
         * It used to surface as a unique violation on the INSERT, because
         * `ux_schedule_assignments_one_operational_primary_child` forbids a second operational row.
         * Now the primitive's FOR UPDATE serialises the two callers and the loser fails its
         * expected-current-row precondition, which the gateway maps to `conflict`. The answer is what
         * it always was: converge if the winner already says what this caller asked for, otherwise a
         * truthful conflict — never a silent overwrite and never an arbitrary winner.
         */
        if (!(e instanceof OperationalEnrollmentServiceError) || e.code !== "conflict") throw e;
        return await convergeAssignmentConflict(supabase, input, resolved, e);
    }

    if (!change.assignment) {
        throw new OperationalEnrollmentServiceError(
            "db_error",
            "persistence reported no assignment successor"
        );
    }

    const assignment = await readAssignmentById(
        supabase,
        input.orgId,
        change.assignment.successorId
    );
    // AFTER a successful commit, never before: a rolled-back transaction must produce no event.
    await emitAssignmentSupersededEvent(input, assignment, {
        id: change.assignment.priorId,
        closeDate: change.assignment.priorEndDate,
    });
    return assignment;
}

export function assertNoOperationalScheduleAssignmentPatch(): void {
    throw new OperationalEnrollmentServiceError(
        "invalid_input",
        "Operational schedule changes must use supersedeScheduleAssignment, not update-in-place"
    );
}

/**
 * Cancel a schedule assignment that should never have applied.
 *
 * The same asymmetry as placements: `supersedeScheduleAssignment` requires the replacement to start
 * strictly after the prior row and closes the prior row the day before, so the superseded row always
 * claims a non-empty period during which those were the child's hours. For an assignment recorded
 * against the wrong child, or with a pattern that was never agreed, that claim is false — and it is
 * not inert, because `project_external_schedule_days` expands assignments into concrete expected
 * days. A wrong assignment left "valid until yesterday" projects attendance expectations that
 * nobody ever owed.
 *
 * Cancelling moves the row to `canceled`, which the projection already excludes (it admits only
 * `active` and `planned`), so the derived days stop without touching the projection. The row is
 * retained and the actor recorded.
 */
export async function cancelScheduleAssignment(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        assignmentId: string;
        actorUserId?: string | null;
    }
): Promise<ScheduleAssignmentRow> {
    const { data: existing, error: readError } = await supabase
        .from("schedule_assignments")
        .select("*")
        .eq("org_id", input.orgId)
        .eq("id", input.assignmentId)
        .maybeSingle();

    if (readError) {
        throw new OperationalEnrollmentServiceError("db_error", readError.message);
    }
    if (!existing) {
        throw new OperationalEnrollmentServiceError("not_found", "Schedule assignment not found");
    }

    const prior = existing as ScheduleAssignmentRow;
    if (prior.status === "canceled") {
        return prior;
    }
    if (!isPlacementOperationalStatus(prior.status)) {
        throw new OperationalEnrollmentServiceError(
            "invalid_state",
            "Only an operational schedule assignment can be cancelled; this one is already closed",
            { status: prior.status }
        );
    }

    const { data, error } = await supabase
        .from("schedule_assignments")
        .update({
            status: "canceled",
            updated_by: trimOrNull(input.actorUserId),
        })
        .eq("org_id", input.orgId)
        .eq("id", input.assignmentId)
        .select("*")
        .single();

    if (error || !data) {
        throw new OperationalEnrollmentServiceError("db_error", error?.message ?? "update failed");
    }
    return data as ScheduleAssignmentRow;
}
