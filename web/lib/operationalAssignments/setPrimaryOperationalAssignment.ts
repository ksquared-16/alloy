/**
 * Atomic primary-assignment mutation.
 *
 * Effective-dated: closes the prior primary (if any) the day before the new
 * effective start, inserts a new primary row, preserves history, and rejects
 * overlapping primary periods. Child home-room compatibility still updates
 * `child_placements` when the primary room/program changes.
 *
 * Callers must go through the registered `assignment.set_primary` action.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { derivePlacementStatusFromStartDate } from "@/lib/childcareOperational/enrollmentOperationalStatus";
import type { ScheduleAssignmentRow } from "@/lib/childcareOperational/enrollmentOperationalTypes";
import {
    assertValidIsoDate,
    computePriorRowCloseDate,
    compareIsoDates,
} from "@/lib/childcareOperational/effectiveDating";
import { getAgreementById } from "@/lib/childcareOperational/enrollmentAgreementService";
import {
    OperationalEnrollmentServiceError,
    trimOrNull,
} from "@/lib/childcareOperational/operationalEnrollmentErrors";
import {
    emitScheduleAssignmentChangedEvent,
} from "@/lib/childcareOperational/operationalEnrollmentEvents";
import { validateSchedulePatternForSite } from "@/lib/childcareOperational/validateChildcareLocationRefs";
import {
    getOperationalPlacementForAgreement,
    createInitialChildPlacement,
    supersedeChildPlacement,
} from "@/lib/childcareOperational/childPlacementService";
import type { OperationalAssignmentSubject } from "@/lib/operationalAssignments/operationalAssignmentService";
import {
    assignmentDateRangesOverlap,
    windowCoversDate,
} from "@/lib/operationalAssignments/primaryOverlap";
import { assertStaffPersonEligibleForAssignment } from "@/lib/operationalAssignments/staffAssignmentEligibility";

export const ASSIGNMENT_SET_PRIMARY_ACTION_KEY = "assignment.set_primary";

export type SetPrimaryCreateSpec = {
    schedulePatternId: string;
    roomLocationId?: string | null;
    programCategoryId?: string | null;
    assignmentTypeId?: string | null;
    metadata?: Record<string, unknown>;
};

export type SetPrimaryOperationalAssignmentInput = {
    orgId: string;
    subject: OperationalAssignmentSubject;
    effectiveDate: string;
    /** Promote an existing assignment's attributes into a new primary row. */
    promoteAssignmentId?: string | null;
    /** Create a brand-new primary from these fields (when not promoting). */
    create?: SetPrimaryCreateSpec | null;
    idempotencyKey?: string | null;
    sourceKey?: string;
    actorUserId?: string | null;
    todayYmd: string;
    /**
     * Test-only fault injection. Throws after the named step so callers can
     * prove compensating rollback.
     */
    __faultAfter?: "close_prior" | "sync_placement" | "insert_primary";
};

export type SetPrimaryOperationalAssignmentResult = {
    primary: ScheduleAssignmentRow;
    priorPrimaryId: string | null;
    priorPrimaryCloseDate: string | null;
    created: boolean;
    idempotent: boolean;
    refreshTargets: {
        subjectType: "child" | "staff";
        enrollmentAgreementId: string | null;
        customerMemberId: string | null;
        personId: string | null;
        siteLocationId: string;
        assignmentIds: string[];
    };
};

type ResolvedSubject = {
    subjectType: "child" | "staff";
    siteLocationId: string;
    enrollmentAgreementId: string | null;
    customerMemberId: string | null;
    personId: string | null;
};

type PrimaryCandidate = {
    schedulePatternId: string;
    roomLocationId: string | null;
    programCategoryId: string | null;
    assignmentTypeId: string | null;
    metadata: Record<string, unknown>;
    promoteFromId: string | null;
};

function samePrimaryIdentity(a: ScheduleAssignmentRow, b: PrimaryCandidate): boolean {
    return (
        a.schedule_pattern_id === b.schedulePatternId &&
        (a.room_location_id ?? null) === (b.roomLocationId ?? null) &&
        (a.program_category_id ?? null) === (b.programCategoryId ?? null) &&
        (a.operational_assignment_type_id ?? null) === (b.assignmentTypeId ?? null)
    );
}

async function resolveSubject(
    supabase: SupabaseClient,
    orgId: string,
    subject: OperationalAssignmentSubject,
    /** Effective date of the primary being set — employment is answered at that date. */
    onDate: string
): Promise<ResolvedSubject> {
    if (subject.type === "child") {
        const enrollmentAgreementId = trimOrNull(subject.enrollmentAgreementId);
        if (!enrollmentAgreementId) {
            throw new OperationalEnrollmentServiceError("invalid_input", "enrollmentAgreementId is required");
        }
        const agreement = await getAgreementById(supabase, orgId, enrollmentAgreementId);
        if (!agreement) {
            throw new OperationalEnrollmentServiceError("not_found", "Enrollment agreement not found");
        }
        if (agreement.status === "canceled" || agreement.status === "ended") {
            throw new OperationalEnrollmentServiceError(
                "invalid_state",
                "Cannot set primary on a terminal enrollment agreement",
                { status: agreement.status }
            );
        }
        return {
            subjectType: "child",
            siteLocationId: agreement.site_location_id,
            enrollmentAgreementId: agreement.id,
            customerMemberId: agreement.customer_member_id,
            personId: null,
        };
    }

    const personId = trimOrNull(subject.personId);
    const siteLocationId = trimOrNull(subject.siteLocationId);
    if (!personId || !siteLocationId) {
        throw new OperationalEnrollmentServiceError(
            "invalid_input",
            "personId and siteLocationId are required for staff subjects"
        );
    }
    // Eligibility is canonical EMPLOYMENT, never persons.is_employee (a waitlist
    // household-priority flag). Same authority the database trigger enforces.
    await assertStaffPersonEligibleForAssignment(supabase, orgId, personId, onDate);
    return {
        subjectType: "staff",
        siteLocationId,
        enrollmentAgreementId: null,
        customerMemberId: null,
        personId,
    };
}

async function listPrimaryRowsForSubject(
    supabase: SupabaseClient,
    orgId: string,
    subject: ResolvedSubject
): Promise<ScheduleAssignmentRow[]> {
    let q = supabase
        .from("schedule_assignments")
        .select("*")
        .eq("org_id", orgId)
        .eq("subject_type", subject.subjectType)
        .eq("is_primary", true);
    if (subject.subjectType === "child") {
        q = q.eq("enrollment_agreement_id", subject.enrollmentAgreementId);
    } else {
        q = q.eq("subject_person_id", subject.personId);
    }
    const { data, error } = await q.order("start_date", { ascending: true });
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    return (data ?? []) as ScheduleAssignmentRow[];
}

function findCoveringPrimary(
    rows: ScheduleAssignmentRow[],
    asOf: string
): ScheduleAssignmentRow | null {
    return rows.find((r) => windowCoversDate(r, asOf)) ?? null;
}

function findOverlappingPrimary(
    rows: ScheduleAssignmentRow[],
    window: { start_date: string; end_date: string | null },
    excludeId?: string | null
): ScheduleAssignmentRow | null {
    return (
        rows.find(
            (r) =>
                r.id !== excludeId &&
                assignmentDateRangesOverlap(
                    { start_date: r.start_date, end_date: r.end_date },
                    window
                )
        ) ?? null
    );
}

async function loadPromoteSource(
    supabase: SupabaseClient,
    orgId: string,
    subject: ResolvedSubject,
    promoteAssignmentId: string
): Promise<PrimaryCandidate> {
    const { data, error } = await supabase
        .from("schedule_assignments")
        .select("*")
        .eq("org_id", orgId)
        .eq("id", promoteAssignmentId)
        .maybeSingle();
    if (error) throw new OperationalEnrollmentServiceError("db_error", error.message);
    const row = data as ScheduleAssignmentRow | null;
    if (!row) {
        throw new OperationalEnrollmentServiceError("not_found", "Assignment to promote was not found");
    }
    if (row.subject_type !== subject.subjectType) {
        throw new OperationalEnrollmentServiceError(
            "validation_failed",
            "Cannot promote an assignment across subject types"
        );
    }
    if (
        subject.subjectType === "child" &&
        row.enrollment_agreement_id !== subject.enrollmentAgreementId
    ) {
        throw new OperationalEnrollmentServiceError(
            "validation_failed",
            "Promote target must belong to the same enrollment agreement"
        );
    }
    if (subject.subjectType === "staff" && row.subject_person_id !== subject.personId) {
        throw new OperationalEnrollmentServiceError(
            "validation_failed",
            "Promote target must belong to the same staff person"
        );
    }
    return {
        schedulePatternId: row.schedule_pattern_id,
        roomLocationId: row.room_location_id ?? null,
        programCategoryId: row.program_category_id ?? null,
        assignmentTypeId: row.operational_assignment_type_id ?? null,
        metadata: { ...(row.metadata ?? {}), promoted_from_assignment_id: row.id },
        promoteFromId: row.id,
    };
}

async function restorePriorPrimary(
    supabase: SupabaseClient,
    orgId: string,
    prior: ScheduleAssignmentRow,
    actorUserId: string | null
): Promise<void> {
    await supabase
        .from("schedule_assignments")
        .update({
            status: prior.status,
            end_date: prior.end_date,
            updated_by: actorUserId,
        })
        .eq("org_id", orgId)
        .eq("id", prior.id);
}

async function deleteInsertedPrimary(
    supabase: SupabaseClient,
    orgId: string,
    assignmentId: string
): Promise<void> {
    await supabase.from("schedule_assignments").delete().eq("org_id", orgId).eq("id", assignmentId);
}

/**
 * Set (or change) the effective primary assignment for a child or staff subject.
 */
export async function setPrimaryOperationalAssignment(
    supabase: SupabaseClient,
    input: SetPrimaryOperationalAssignmentInput
): Promise<SetPrimaryOperationalAssignmentResult> {
    const effectiveDate = trimOrNull(input.effectiveDate);
    if (!effectiveDate) {
        throw new OperationalEnrollmentServiceError("invalid_input", "effectiveDate is required");
    }
    assertValidIsoDate(effectiveDate, "effectiveDate");

    const promoteId = trimOrNull(input.promoteAssignmentId);
    const createSpec = input.create ?? null;
    if (!promoteId && !createSpec?.schedulePatternId) {
        throw new OperationalEnrollmentServiceError(
            "invalid_input",
            "Provide promoteAssignmentId or create.schedulePatternId"
        );
    }
    if (promoteId && createSpec?.schedulePatternId) {
        throw new OperationalEnrollmentServiceError(
            "invalid_input",
            "Provide either promoteAssignmentId or create, not both"
        );
    }

    const subject = await resolveSubject(supabase, input.orgId, input.subject, input.effectiveDate);
    const idempotencyKey = trimOrNull(input.idempotencyKey);
    const actorUserId = trimOrNull(input.actorUserId);
    const sourceKey = trimOrNull(input.sourceKey) ?? "operator";

    const primaries = await listPrimaryRowsForSubject(supabase, input.orgId, subject);

    if (idempotencyKey) {
        const priorIdempotent = primaries.find(
            (r) => String((r.metadata as Record<string, unknown>)?.idempotency_key ?? "") === idempotencyKey
        );
        if (priorIdempotent) {
            return {
                primary: priorIdempotent,
                priorPrimaryId: null,
                priorPrimaryCloseDate: null,
                created: false,
                idempotent: true,
                refreshTargets: buildRefresh(subject, [priorIdempotent.id]),
            };
        }
    }

    const candidate: PrimaryCandidate = promoteId
        ? await loadPromoteSource(supabase, input.orgId, subject, promoteId)
        : {
              schedulePatternId: trimOrNull(createSpec!.schedulePatternId)!,
              roomLocationId: trimOrNull(createSpec?.roomLocationId) ?? null,
              programCategoryId: trimOrNull(createSpec?.programCategoryId) ?? null,
              assignmentTypeId: trimOrNull(createSpec?.assignmentTypeId) ?? null,
              metadata: { ...(createSpec?.metadata ?? {}) },
              promoteFromId: null,
          };

    const patternCheck = await validateSchedulePatternForSite(
        supabase,
        input.orgId,
        subject.siteLocationId,
        candidate.schedulePatternId
    );
    if (!patternCheck.ok) {
        throw new OperationalEnrollmentServiceError("validation_failed", patternCheck.error.message, {
            field: "schedule_pattern_id",
        });
    }

    const covering = findCoveringPrimary(primaries, effectiveDate);
    if (covering && samePrimaryIdentity(covering, candidate) && covering.is_primary) {
        return {
            primary: covering,
            priorPrimaryId: covering.id,
            priorPrimaryCloseDate: null,
            created: false,
            idempotent: true,
            refreshTargets: buildRefresh(subject, [covering.id]),
        };
    }

    // New primary is open-ended from effectiveDate. Any overlapping primary (including
    // an open current one) must be closed first or rejected if it cannot be closed cleanly.
    const proposedWindow = { start_date: effectiveDate, end_date: null as string | null };
    const overlapping = findOverlappingPrimary(primaries, proposedWindow, covering?.id ?? null);
    if (overlapping && overlapping.id !== covering?.id) {
        // A non-covering overlapping primary (e.g. future primary already booked that
        // intersects) cannot be silently rewritten by this command.
        throw new OperationalEnrollmentServiceError(
            "conflict",
            "A primary assignment already overlaps the requested effective period",
            { assignment_id: overlapping.id }
        );
    }

    let priorSnapshot: ScheduleAssignmentRow | null = null;
    let priorCloseDate: string | null = null;
    let insertedId: string | null = null;
    let placementSynced = false;

    try {
        if (covering) {
            if (compareIsoDates(effectiveDate, covering.start_date) <= 0) {
                throw new OperationalEnrollmentServiceError(
                    "validation_failed",
                    "effectiveDate must be after the current primary start_date"
                );
            }
            priorCloseDate = computePriorRowCloseDate(effectiveDate);
            priorSnapshot = { ...covering };
            const { error: closeError } = await supabase
                .from("schedule_assignments")
                .update({
                    status: "superseded",
                    end_date: priorCloseDate,
                    updated_by: actorUserId,
                })
                .eq("org_id", input.orgId)
                .eq("id", covering.id);
            if (closeError) {
                throw new OperationalEnrollmentServiceError("db_error", closeError.message);
            }
            if (input.__faultAfter === "close_prior") {
                throw new OperationalEnrollmentServiceError("db_error", "fault:close_prior");
            }
        }

        if (subject.subjectType === "child" && subject.enrollmentAgreementId) {
            const placement = await getOperationalPlacementForAgreement(
                supabase,
                input.orgId,
                subject.enrollmentAgreementId
            );
            const room = candidate.roomLocationId;
            const program = candidate.programCategoryId;
            if (!placement) {
                await createInitialChildPlacement(supabase, {
                    orgId: input.orgId,
                    enrollmentAgreementId: subject.enrollmentAgreementId,
                    startDate: effectiveDate,
                    programCategoryId: program,
                    roomLocationId: room,
                    sourceKey,
                    actorUserId,
                    todayYmd: input.todayYmd,
                });
                placementSynced = true;
            } else if (
                (room != null && placement.room_location_id !== room) ||
                (program != null && placement.program_category_id !== program)
            ) {
                await supersedeChildPlacement(supabase, {
                    orgId: input.orgId,
                    enrollmentAgreementId: subject.enrollmentAgreementId,
                    startDate: effectiveDate,
                    programCategoryId: program ?? placement.program_category_id,
                    roomLocationId: room ?? placement.room_location_id,
                    sourceKey,
                    actorUserId,
                    todayYmd: input.todayYmd,
                });
                placementSynced = true;
            }
            if (input.__faultAfter === "sync_placement") {
                throw new OperationalEnrollmentServiceError("db_error", "fault:sync_placement");
            }
        }

        const metadata: Record<string, unknown> = { ...candidate.metadata };
        if (idempotencyKey) metadata.idempotency_key = idempotencyKey;

        const row = {
            org_id: input.orgId,
            subject_type: subject.subjectType,
            enrollment_agreement_id: subject.enrollmentAgreementId,
            customer_member_id: subject.customerMemberId,
            subject_person_id: subject.personId,
            site_location_id: subject.siteLocationId,
            room_location_id: candidate.roomLocationId,
            program_category_id: candidate.programCategoryId,
            operational_assignment_type_id: candidate.assignmentTypeId,
            is_primary: true,
            schedule_pattern_id: candidate.schedulePatternId,
            start_date: effectiveDate,
            end_date: null,
            status: derivePlacementStatusFromStartDate(effectiveDate, input.todayYmd),
            assignment_kind: "base",
            source_key: sourceKey,
            supersedes_assignment_id: priorSnapshot?.id ?? null,
            metadata,
            created_by: actorUserId,
            updated_by: actorUserId,
        };

        const { data, error } = await supabase
            .from("schedule_assignments")
            .insert(row)
            .select("*")
            .single();
        if (error || !data) {
            throw new OperationalEnrollmentServiceError(
                "db_error",
                error?.message ?? "Could not insert primary assignment"
            );
        }
        const primary = data as ScheduleAssignmentRow;
        insertedId = primary.id;

        if (input.__faultAfter === "insert_primary") {
            throw new OperationalEnrollmentServiceError("db_error", "fault:insert_primary");
        }

        // Post-insert overlap guard (DB trigger is authoritative; this catches mock stores).
        const stillOverlapping = findOverlappingPrimary(
            [...primaries.filter((p) => p.id !== priorSnapshot?.id), primary],
            proposedWindow,
            primary.id
        );
        if (stillOverlapping) {
            throw new OperationalEnrollmentServiceError(
                "conflict",
                "A primary assignment already overlaps the requested effective period",
                { assignment_id: stillOverlapping.id }
            );
        }

        if (subject.subjectType === "child" && primary.enrollment_agreement_id && primary.customer_member_id) {
            await emitScheduleAssignmentChangedEvent({
                orgId: input.orgId,
                assignmentId: primary.id,
                enrollmentAgreementId: primary.enrollment_agreement_id,
                schedulePatternId: primary.schedule_pattern_id,
                customerMemberId: primary.customer_member_id,
                startDate: primary.start_date,
                supersedesAssignmentId: priorSnapshot?.id ?? null,
                priorAssignmentCloseDate: priorCloseDate,
                sourceKey,
                ctx: { actorUserId },
            });
        }

        return {
            primary,
            priorPrimaryId: priorSnapshot?.id ?? null,
            priorPrimaryCloseDate: priorCloseDate,
            created: true,
            idempotent: false,
            refreshTargets: buildRefresh(
                subject,
                [primary.id, priorSnapshot?.id].filter(Boolean) as string[]
            ),
        };
    } catch (err) {
        if (insertedId) {
            await deleteInsertedPrimary(supabase, input.orgId, insertedId);
        }
        if (priorSnapshot) {
            await restorePriorPrimary(supabase, input.orgId, priorSnapshot, actorUserId);
        }
        // Placement supersede compensation is intentionally not rewound here: the
        // placement services own their own supersede chain. Faults before insert
        // restore the prior primary; faults after insert delete the new primary
        // and restore the prior primary. Placement sync faults after a successful
        // placement write leave the placement chain intact (effective-dated) while
        // restoring the prior primary so no overlapping primary remains.
        void placementSynced;
        throw err;
    }
}

function buildRefresh(
    subject: ResolvedSubject,
    assignmentIds: string[]
): SetPrimaryOperationalAssignmentResult["refreshTargets"] {
    return {
        subjectType: subject.subjectType,
        enrollmentAgreementId: subject.enrollmentAgreementId,
        customerMemberId: subject.customerMemberId,
        personId: subject.personId,
        siteLocationId: subject.siteLocationId,
        assignmentIds,
    };
}
