/**
 * Direct Enroll — establish the durable care relationship without the acquisition journey.
 *
 * ── WHAT IT BYPASSES, AND WHAT IT MUST NOT ──
 *
 * Bypasses: lead qualification, contact attempts, tour, stage progression — the whole governed
 * journey. A director enrolling a known family's second child is not prospecting them.
 *
 * Does NOT bypass: the durable facts. "Skip the process" is not "skip the information". The child
 * still needs a site, a start date, somewhere to be placed and a schedule to be expected on.
 *
 * It creates NO `process_instances` row. Writing one to record that enrollment happened would be
 * fabricating a journey nobody ran, and stamping its stages completed would fabricate history.
 * The absence of a journey IS the truthful record of a direct enrollment.
 *
 * ── MATERIALIZATION IS NOT FORKED ──
 *
 * `applyChildEnrollmentMaterialization` is the one core that turns facts into the durable trio, and
 * it is already fact-source-agnostic by design. This service resolves operator facts and hands them
 * over; it writes no agreement, placement or schedule itself.
 *
 * ── WHY A PREFLIGHT SITS IN FRONT OF IT ──
 *
 * The core is deliberately forgiving: absent placement fields make it SKIP the placement, and an
 * unresolvable schedule type degrades to a WARNING. That tolerance is right for a journey that has
 * already gathered facts over weeks, and wrong for a one-shot operator command — it would report
 * success while leaving a child who cannot appear on any roster and cannot be marked present. So
 * readiness is judged BEFORE the write, and anything that would produce an operationally
 * unusable child blocks it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ActionBlocker } from "@/lib/adminV2/actions/actionTypes";
import {
    applyChildEnrollmentMaterialization,
    resolveSchedulePatternForScheduleType,
    type ChildEnrollmentTrioResult,
} from "@/lib/childcareOperational/materializeChildEnrollment";
import { RecordCreationError } from "@/lib/records/recordCreationErrors";

export type DirectEnrollInput = {
    orgId: string;
    /** The durable child subject — `customer_members.id`. */
    customerMemberId: string;
    siteLocationId: string;
    startDate: string;
    programCategoryId?: string | null;
    roomLocationId?: string | null;
    schedulePatternId?: string | null;
    scheduleType?: string | null;
    /** The organisation's operational day. Defaults to the start date when the caller omits it. */
    todayYmd?: string | null;
    actorUserId?: string | null;
};

export type DirectEnrollReadiness = {
    ready: boolean;
    /** Refuse the write. Each one would leave the child operationally unusable. */
    blockers: ActionBlocker[];
    /** Safe to proceed past, but the operator is told. */
    warnings: string[];
    /** The schedule pattern the facts resolve to, when they resolve to one. */
    resolvedSchedulePatternId: string | null;
};

export type DirectEnrollResult = {
    customerMemberId: string;
    trio: ChildEnrollmentTrioResult;
    agreementId: string | null;
    placementId: string | null;
    scheduleAssignmentId: string | null;
};

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Judge readiness WITHOUT writing anything.
 *
 * Shared by preview and execute, so what the operator is shown and what the server enforces are
 * the same evaluation rather than two that can drift.
 */
export async function evaluateDirectEnrollReadiness(
    supabase: SupabaseClient,
    input: DirectEnrollInput
): Promise<DirectEnrollReadiness> {
    const blockers: ActionBlocker[] = [];
    const warnings: string[] = [];

    const orgId = t(input.orgId);
    const customerMemberId = t(input.customerMemberId);
    const siteLocationId = t(input.siteLocationId);
    const startDate = t(input.startDate);

    if (!customerMemberId) {
        blockers.push({
            code: "missing_child",
            message: "Select the child to enroll",
            field: "customer_member_id",
        });
    }
    if (!siteLocationId) {
        // The materializer refuses without it, and a child with no site cannot be rostered.
        blockers.push({
            code: "missing_site",
            message: "A site is required — an enrolled child has to be somewhere",
            field: "site_location_id",
        });
    }
    if (!startDate) {
        blockers.push({
            code: "missing_start_date",
            message: "A start date is required — it decides when the child is expected",
            field: "start_date",
        });
    } else if (!ISO_DATE.test(startDate)) {
        blockers.push({
            code: "invalid_start_date",
            message: "start_date must be YYYY-MM-DD",
            field: "start_date",
        });
    }

    // ── Placement. The core SKIPS placement when neither program nor room is given, which would
    // leave an agreement with nowhere attached — invisible to Roster and to the Records site column.
    const programCategoryId = t(input.programCategoryId);
    const roomLocationId = t(input.roomLocationId);
    if (!programCategoryId && !roomLocationId) {
        blockers.push({
            code: "missing_placement",
            message: "A program or a room is required — without one the child is enrolled nowhere",
            field: "program_category_id",
        });
    }

    // ── Schedule. This is the blocker the brief exists for: a silently schedule-less child cannot
    // be expected on any day, so Roster and Attendance simply never see them.
    let resolvedSchedulePatternId = t(input.schedulePatternId) || null;
    const scheduleType = t(input.scheduleType);
    if (!resolvedSchedulePatternId && !scheduleType) {
        blockers.push({
            code: "missing_schedule",
            message: "A schedule is required — without one the child is never expected on any day",
            field: "schedule_type",
        });
    } else if (!resolvedSchedulePatternId && scheduleType && orgId && siteLocationId) {
        const pattern = await resolveSchedulePatternForScheduleType(
            supabase,
            orgId,
            siteLocationId,
            scheduleType
        );
        const patternId = pattern ? t((pattern as { id?: string }).id) : "";
        if (!patternId) {
            // The core would have downgraded this to a warning and still reported success.
            blockers.push({
                code: "unresolvable_schedule",
                message: `No active schedule pattern at this site matches "${scheduleType}"`,
                field: "schedule_type",
            });
        } else {
            resolvedSchedulePatternId = patternId;
        }
    }

    if (!programCategoryId && roomLocationId) {
        warnings.push("Placing by room without a program — capacity by program will not apply.");
    }

    return { ready: blockers.length === 0, blockers, warnings, resolvedSchedulePatternId };
}

/** Raised when readiness refuses the write. Carries the blockers for the operator surface. */
export class DirectEnrollNotReadyError extends RecordCreationError {
    readonly blockers: ActionBlocker[];

    constructor(blockers: ActionBlocker[]) {
        super("invalid_state", "This child cannot be enrolled directly yet.", { blockers });
        this.name = "DirectEnrollNotReadyError";
        this.blockers = blockers;
    }
}

export async function directEnroll(
    supabase: SupabaseClient,
    input: DirectEnrollInput
): Promise<DirectEnrollResult> {
    const orgId = t(input.orgId);
    if (!orgId) throw new RecordCreationError("invalid_input", "orgId is required");

    const readiness = await evaluateDirectEnrollReadiness(supabase, input);
    if (!readiness.ready) throw new DirectEnrollNotReadyError(readiness.blockers);

    const customerMemberId = t(input.customerMemberId);
    const { data: child, error } = await supabase
        .from("customer_members")
        .select("id, person_id, customer_id")
        .eq("org_id", orgId)
        .eq("id", customerMemberId)
        .eq("relationship", "child")
        .maybeSingle();
    if (error) throw new RecordCreationError("db_error", error.message);
    if (!child) {
        throw new RecordCreationError("not_found", "Child record not found in this organization");
    }
    const row = child as { id: string; person_id: string | null; customer_id: string | null };

    // The ONE materialization core. This service resolves facts; it never writes the trio itself.
    const trio = await applyChildEnrollmentMaterialization(supabase, {
        orgId,
        // NULL, deliberately. The core accepts it, and `child_enrollment_agreements.opportunity_id`
        // is nullable precisely so durable care truth can exist with no acquisition episode.
        opportunityId: null,
        customerId: row.customer_id,
        todayYmd: t(input.todayYmd) || t(input.startDate),
        actorUserId: input.actorUserId ?? null,
        facts: {
            customerMemberId,
            siteLocationId: t(input.siteLocationId),
            startDate: t(input.startDate),
            programCategoryId: t(input.programCategoryId) || null,
            roomLocationId: t(input.roomLocationId) || null,
            // Preflight already resolved the pattern, so the core does not have to guess again.
            schedulePatternId: readiness.resolvedSchedulePatternId,
            personId: row.person_id,
            // No opportunity: `child_enrollment_agreements.opportunity_id` is nullable precisely so
            // durable care truth can exist without an acquisition episode.
            opportunityCustomerMemberId: null,
        },
        emitEvents: true,
        sourceKey: "direct_enroll",
    });

    if (trio.agreement.outcome === "error") {
        throw new RecordCreationError(
            "db_error",
            trio.agreement.error ?? "Could not create the enrollment agreement"
        );
    }

    return {
        customerMemberId,
        trio,
        agreementId: trio.agreement.id ?? null,
        placementId: trio.placement.id ?? null,
        scheduleAssignmentId: trio.schedule_assignment.id ?? null,
    };
}
