/**
 * Idempotent operational enrollment handoff from approved opportunity / OCM rows.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    createChildEnrollmentAgreement,
    getOperationalAgreementForMemberSite,
} from "@/lib/childcareOperational/enrollmentAgreementService";
import {
    createInitialChildPlacement,
    getOperationalPlacementForAgreement,
} from "@/lib/childcareOperational/childPlacementService";
import {
    createInitialScheduleAssignment,
    getOperationalScheduleAssignmentForAgreement,
} from "@/lib/childcareOperational/scheduleAssignmentService";
import { listSchedulePatterns } from "@/lib/childcareOperational/schedulePatternService";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import {
    emitEnrollmentAgreementCreatedEvent,
    emitOperationalEnrollmentHandoffSummaryEvent,
    emitPlacementCreatedEvent,
    emitScheduleAssignmentCreatedEvent,
} from "@/lib/childcareOperational/operationalEnrollmentEvents";
const HANDOFF_SOURCE_KEY = "approve_enrollment_handoff";

function trimOrNull(v: unknown): string | null {
    const s = v != null ? String(v).trim() : "";
    return s || null;
}

export type HandoffStepOutcome = "created" | "reused" | "skipped" | "warning";

export type ChildOperationalEnrollmentHandoffResult = {
    opportunity_customer_member_id: string;
    customer_member_id: string | null;
    site_location_id: string | null;
    skipped: boolean;
    skip_reason?: string;
    agreement: {
        outcome: HandoffStepOutcome | "error";
        id?: string;
        error?: string;
    };
    placement: {
        outcome: HandoffStepOutcome;
        id?: string;
        warning?: string;
    };
    schedule_assignment: {
        outcome: HandoffStepOutcome;
        id?: string;
        warning?: string;
    };
    warnings: string[];
};

export type OperationalEnrollmentHandoffResult = {
    ok: boolean;
    error?: string;
    partial: boolean;
    opportunity_id: string;
    children: ChildOperationalEnrollmentHandoffResult[];
};

type OcmHandoffRow = {
    id: string;
    customer_member_id: string | null;
    location_id: string | null;
    program_category_id: string | null;
    program_room_cohort_key: string | null;
    schedule_type: string | null;
    start_date: string | null;
    person_id?: string | null;
};

export type ExecuteOperationalEnrollmentHandoffInput = {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    actorUserId?: string | null;
    todayYmd: string;
    enrollmentDateYmd?: string | null;
    emitEvents?: boolean;
    correlationId?: string | null;
};

async function resolveSchedulePatternForScheduleType(
    supabase: SupabaseClient,
    orgId: string,
    siteLocationId: string,
    scheduleTypeInput: string | null
) {
    const scheduleType = trimOrNull(scheduleTypeInput);
    if (!scheduleType) return null;

    const patterns = await listSchedulePatterns(supabase, orgId, {
        siteLocationId,
        isActive: true,
    });

    const exact =
        patterns.find((p) => p.schedule_type_key === scheduleType) ??
        patterns.find((p) => p.key === scheduleType);
    return exact ?? null;
}

async function loadHandoffContext(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string
): Promise<{
    opportunityLocationId: string | null;
    customerId: string | null;
    ocmRows: OcmHandoffRow[];
}> {
    const { data: opp, error: oppErr } = await supabase
        .from("opportunities")
        .select("location_id, customer_id")
        .eq("org_id", orgId)
        .eq("id", opportunityId)
        .maybeSingle();

    if (oppErr) {
        throw new OperationalEnrollmentServiceError("db_error", oppErr.message);
    }
    if (!opp) {
        throw new OperationalEnrollmentServiceError("not_found", "Opportunity not found");
    }

    const { data: ocmData, error: ocmErr } = await supabase
        .from("opportunity_customer_members")
        .select(
            "id, customer_member_id, location_id, program_category_id, program_room_cohort_key, schedule_type, start_date, person_id"
        )
        .eq("org_id", orgId)
        .eq("opportunity_id", opportunityId);

    if (ocmErr) {
        throw new OperationalEnrollmentServiceError("db_error", ocmErr.message);
    }

    const oppRow = opp as { location_id?: string | null; customer_id?: string | null };
    return {
        opportunityLocationId: trimOrNull(oppRow.location_id),
        customerId: trimOrNull(oppRow.customer_id),
        ocmRows: (ocmData ?? []) as OcmHandoffRow[],
    };
}

async function handoffSingleChild(input: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    customerId: string | null;
    opportunityLocationId: string | null;
    ocm: OcmHandoffRow;
    todayYmd: string;
    startDateYmd: string;
    actorUserId?: string | null;
    emitEvents: boolean;
    correlationId?: string | null;
}): Promise<ChildOperationalEnrollmentHandoffResult> {
    const warnings: string[] = [];
    const result: ChildOperationalEnrollmentHandoffResult = {
        opportunity_customer_member_id: input.ocm.id,
        customer_member_id: trimOrNull(input.ocm.customer_member_id),
        site_location_id: null,
        skipped: false,
        agreement: { outcome: "skipped" },
        placement: { outcome: "skipped" },
        schedule_assignment: { outcome: "skipped" },
        warnings,
    };

    const customerMemberId = trimOrNull(input.ocm.customer_member_id);
    if (!customerMemberId) {
        result.skipped = true;
        result.skip_reason = "missing_customer_member_id";
        result.agreement = { outcome: "skipped" };
        return result;
    }

    let siteLocationId = trimOrNull(input.ocm.location_id);
    if (!siteLocationId && input.opportunityLocationId) {
        siteLocationId = input.opportunityLocationId;
        warnings.push("site_resolved_from_opportunity_location_id");
    }
    result.site_location_id = siteLocationId;

    if (!siteLocationId) {
        result.skipped = true;
        result.skip_reason = "missing_site_location_id";
        result.agreement = { outcome: "error", error: "No site location on OCM or opportunity" };
        return result;
    }

    let agreement =
        (await getOperationalAgreementForMemberSite(
            input.supabase,
            input.orgId,
            customerMemberId,
            siteLocationId
        )) ?? null;

    if (agreement) {
        result.agreement = { outcome: "reused", id: agreement.id };
    } else {
        try {
            agreement = await createChildEnrollmentAgreement(input.supabase, {
                orgId: input.orgId,
                customerMemberId,
                siteLocationId,
                startDate: input.startDateYmd,
                opportunityId: input.opportunityId,
                opportunityCustomerMemberId: input.ocm.id,
                customerId: input.customerId,
                personId: trimOrNull(input.ocm.person_id),
                sourceKey: HANDOFF_SOURCE_KEY,
                metadata: {
                    handoff: true,
                    ...(warnings.length ? { handoff_warnings: [...warnings] } : {}),
                },
                actorUserId: input.actorUserId,
                todayYmd: input.todayYmd,
            });
            result.agreement = { outcome: "created", id: agreement.id };
            if (input.emitEvents) {
                await emitEnrollmentAgreementCreatedEvent({
                    orgId: input.orgId,
                    agreementId: agreement.id,
                    opportunityId: input.opportunityId,
                    customerMemberId,
                    siteLocationId,
                    sourceKey: HANDOFF_SOURCE_KEY,
                    ctx: {
                        actorUserId: input.actorUserId,
                        correlationId: input.correlationId,
                    },
                });
            }
        } catch (e) {
            const message =
                e instanceof OperationalEnrollmentServiceError
                    ? e.message
                    : e instanceof Error
                      ? e.message
                      : "Agreement creation failed";
            result.agreement = { outcome: "error", error: message };
            return result;
        }
    }

    // Canonical program FK straight off the OCM row — no key→category resolution.
    const programCategoryId = trimOrNull(input.ocm.program_category_id);
    const roomLocationId = trimOrNull(input.ocm.program_room_cohort_key);
    const hasPlacementFields = Boolean(programCategoryId || roomLocationId);

    if (!hasPlacementFields) {
        result.placement = {
            outcome: "skipped",
            warning: "no_program_or_room_fields",
        };
    } else {
        const existingPlacement = await getOperationalPlacementForAgreement(
            input.supabase,
            input.orgId,
            agreement.id
        );
        if (existingPlacement) {
            result.placement = { outcome: "reused", id: existingPlacement.id };
        } else {
            try {
                const placement = await createInitialChildPlacement(input.supabase, {
                    orgId: input.orgId,
                    enrollmentAgreementId: agreement.id,
                    startDate: input.startDateYmd,
                    programCategoryId,
                    roomLocationId,
                    sourceKey: HANDOFF_SOURCE_KEY,
                    metadata: { handoff: true },
                    actorUserId: input.actorUserId,
                    todayYmd: input.todayYmd,
                });
                result.placement = { outcome: "created", id: placement.id };
                if (input.emitEvents) {
                    await emitPlacementCreatedEvent({
                        orgId: input.orgId,
                        placementId: placement.id,
                        enrollmentAgreementId: agreement.id,
                        customerMemberId,
                        siteLocationId,
                        ctx: {
                            actorUserId: input.actorUserId,
                            correlationId: input.correlationId,
                        },
                    });
                }
            } catch (e) {
                const message =
                    e instanceof OperationalEnrollmentServiceError
                        ? e.message
                        : e instanceof Error
                          ? e.message
                          : "Placement creation failed";
                result.placement = { outcome: "warning", warning: message };
                warnings.push(`placement_warning:${message}`);
            }
        }
    }

    const scheduleType = trimOrNull(input.ocm.schedule_type);
    if (!scheduleType) {
        result.schedule_assignment = {
            outcome: "skipped",
            warning: "no_schedule_type",
        };
    } else {
        const existingAssignment = await getOperationalScheduleAssignmentForAgreement(
            input.supabase,
            input.orgId,
            agreement.id
        );
        if (existingAssignment) {
            result.schedule_assignment = { outcome: "reused", id: existingAssignment.id };
        } else {
            try {
                const pattern = await resolveSchedulePatternForScheduleType(
                    input.supabase,
                    input.orgId,
                    siteLocationId,
                    scheduleType
                );
                if (!pattern) {
                    result.schedule_assignment = {
                        outcome: "warning",
                        warning: `no_schedule_pattern_for:${scheduleType}`,
                    };
                    warnings.push(`schedule_pattern_missing:${scheduleType}`);
                } else {
                    const assignment = await createInitialScheduleAssignment(input.supabase, {
                        orgId: input.orgId,
                        enrollmentAgreementId: agreement.id,
                        schedulePatternId: pattern.id,
                        startDate: input.startDateYmd,
                        sourceKey: HANDOFF_SOURCE_KEY,
                        metadata: { handoff: true, schedule_type_key: scheduleType },
                        actorUserId: input.actorUserId,
                        todayYmd: input.todayYmd,
                    });
                    result.schedule_assignment = { outcome: "created", id: assignment.id };
                    if (input.emitEvents) {
                        await emitScheduleAssignmentCreatedEvent({
                            orgId: input.orgId,
                            assignmentId: assignment.id,
                            enrollmentAgreementId: agreement.id,
                            schedulePatternId: pattern.id,
                            customerMemberId,
                            ctx: {
                                actorUserId: input.actorUserId,
                                correlationId: input.correlationId,
                            },
                        });
                    }
                }
            } catch (e) {
                const message =
                    e instanceof OperationalEnrollmentServiceError
                        ? e.message
                        : e instanceof Error
                          ? e.message
                          : "Schedule assignment failed";
                result.schedule_assignment = { outcome: "warning", warning: message };
                warnings.push(`schedule_assignment_warning:${message}`);
            }
        }
    }

    result.warnings = warnings;
    return result;
}

export async function executeOperationalEnrollmentHandoffFromApprovedOpportunity(
    input: ExecuteOperationalEnrollmentHandoffInput
): Promise<OperationalEnrollmentHandoffResult> {
    const emitEvents = input.emitEvents !== false;
    const ctx = await loadHandoffContext(input.supabase, input.orgId, input.opportunityId);

    const children: ChildOperationalEnrollmentHandoffResult[] = [];
    const allWarnings: string[] = [];
    let hasAgreementError = false;

    for (const ocm of ctx.ocmRows) {
        const startDateYmd =
            trimOrNull(ocm.start_date) ??
            trimOrNull(input.enrollmentDateYmd) ??
            input.todayYmd;

        const childResult = await handoffSingleChild({
            supabase: input.supabase,
            orgId: input.orgId,
            opportunityId: input.opportunityId,
            customerId: ctx.customerId,
            opportunityLocationId: ctx.opportunityLocationId,
            ocm,
            todayYmd: input.todayYmd,
            startDateYmd,
            actorUserId: input.actorUserId,
            emitEvents,
            correlationId: input.correlationId,
        });
        children.push(childResult);
        allWarnings.push(...childResult.warnings);

        if (childResult.agreement.outcome === "error" && !childResult.skipped) {
            hasAgreementError = true;
        }
    }

    const partial =
        allWarnings.length > 0 ||
        children.some(
            (c) =>
                c.placement.outcome === "warning" ||
                c.schedule_assignment.outcome === "warning" ||
                c.placement.warning != null ||
                c.schedule_assignment.warning != null
        );

    if (emitEvents && children.length > 0) {
        await emitOperationalEnrollmentHandoffSummaryEvent({
            orgId: input.orgId,
            opportunityId: input.opportunityId,
            partial,
            childCount: children.length,
            warnings: allWarnings,
            ctx: {
                actorUserId: input.actorUserId,
                correlationId: input.correlationId,
            },
        });
    }

    if (hasAgreementError) {
        const failed = children.find((c) => c.agreement.outcome === "error");
        return {
            ok: false,
            error: failed?.agreement.error ?? "Operational enrollment agreement handoff failed",
            partial,
            opportunity_id: input.opportunityId,
            children,
        };
    }

    return {
        ok: true,
        partial,
        opportunity_id: input.opportunityId,
        children,
    };
}
