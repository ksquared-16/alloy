/**
 * Shared child-enrollment materialization core.
 *
 * Given RESOLVED enrollment facts for one child, create/reuse the durable operational trio:
 *   child_enrollment_agreements (relationship) → child_placements (program/room/site)
 *   → schedule_assignments (schedule pattern).
 *
 * This is the single place that turns facts into durable operational truth. Both callers delegate here:
 *   - materializeEnrollmentFromProcessInstance (process-instance completion — the canonical path)
 *   - executeOperationalEnrollmentHandoffFromApprovedOpportunity (legacy admin "Approve Enrollment")
 *
 * The core is fact-source-agnostic: callers resolve facts (from process instance, placement_candidates,
 * or OCM) and pass them in. The core never reads OCM. Idempotent via getOperational*ForAgreement/MemberSite.
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
    emitPlacementCreatedEvent,
    emitScheduleAssignmentCreatedEvent,
} from "@/lib/childcareOperational/operationalEnrollmentEvents";

export type HandoffStepOutcome = "created" | "reused" | "skipped" | "warning";

/** Facts a caller must resolve before materializing. customerMemberId + siteLocationId are required. */
export type ResolvedEnrollmentFacts = {
    customerMemberId: string;
    siteLocationId: string;
    startDate: string;
    programCategoryId?: string | null;
    roomLocationId?: string | null;
    /** Preferred: a resolved schedule pattern id. */
    schedulePatternId?: string | null;
    /** Else a schedule-type key resolved against the site's active patterns. */
    scheduleType?: string | null;
    endDate?: string | null;
    opportunityCustomerMemberId?: string | null;
    personId?: string | null;
    /** Billing/funding are stored as agreement metadata for now (promotion path documented). */
    billing?: Record<string, unknown> | null;
    funding?: Record<string, unknown> | null;
};

export type ChildEnrollmentTrioResult = {
    site_location_id: string | null;
    agreement: { outcome: HandoffStepOutcome | "error"; id?: string; error?: string };
    placement: { outcome: HandoffStepOutcome; id?: string; warning?: string };
    schedule_assignment: { outcome: HandoffStepOutcome; id?: string; warning?: string };
    warnings: string[];
};

function trimOrNull(v: unknown): string | null {
    const s = v != null ? String(v).trim() : "";
    return s || null;
}

/** Resolve a schedule pattern for a schedule-type key against the site's active patterns. */
export async function resolveSchedulePatternForScheduleType(
    supabase: SupabaseClient,
    orgId: string,
    siteLocationId: string,
    scheduleTypeInput: string | null,
) {
    const scheduleType = trimOrNull(scheduleTypeInput);
    if (!scheduleType) return null;
    const patterns = await listSchedulePatterns(supabase, orgId, { siteLocationId, isActive: true });
    return (
        patterns.find((p) => p.schedule_type_key === scheduleType) ??
        patterns.find((p) => p.key === scheduleType) ??
        null
    );
}

/**
 * Materialize the durable operational trio for one child from resolved facts. Idempotent: reuses an
 * existing operational agreement / placement / schedule assignment instead of duplicating.
 */
export async function applyChildEnrollmentMaterialization(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        opportunityId: string | null;
        customerId: string | null;
        facts: ResolvedEnrollmentFacts;
        todayYmd: string;
        sourceKey: string;
        actorUserId?: string | null;
        emitEvents?: boolean;
        correlationId?: string | null;
        /** Extra provenance recorded on the agreement metadata (e.g. process_instance_id). */
        agreementMetadata?: Record<string, unknown>;
    },
): Promise<ChildEnrollmentTrioResult> {
    const { orgId, facts } = input;
    const emitEvents = input.emitEvents !== false;
    const warnings: string[] = [];
    const result: ChildEnrollmentTrioResult = {
        site_location_id: facts.siteLocationId,
        agreement: { outcome: "skipped" },
        placement: { outcome: "skipped" },
        schedule_assignment: { outcome: "skipped" },
        warnings,
    };

    // --- Agreement (relationship header) ---
    let agreement =
        (await getOperationalAgreementForMemberSite(
            supabase,
            orgId,
            facts.customerMemberId,
            facts.siteLocationId,
        )) ?? null;

    if (agreement) {
        result.agreement = { outcome: "reused", id: agreement.id };
    } else {
        try {
            const billingFunding: Record<string, unknown> = {};
            if (facts.billing) billingFunding.billing = facts.billing;
            if (facts.funding) billingFunding.funding = facts.funding;
            agreement = await createChildEnrollmentAgreement(supabase, {
                orgId,
                customerMemberId: facts.customerMemberId,
                siteLocationId: facts.siteLocationId,
                startDate: facts.startDate,
                opportunityId: input.opportunityId,
                opportunityCustomerMemberId: facts.opportunityCustomerMemberId ?? null,
                customerId: input.customerId,
                personId: facts.personId ?? null,
                sourceKey: input.sourceKey,
                metadata: {
                    ...(input.agreementMetadata ?? {}),
                    ...billingFunding,
                    ...(warnings.length ? { handoff_warnings: [...warnings] } : {}),
                },
                actorUserId: input.actorUserId,
                todayYmd: input.todayYmd,
            });
            result.agreement = { outcome: "created", id: agreement.id };
            if (emitEvents) {
                await emitEnrollmentAgreementCreatedEvent({
                    orgId,
                    agreementId: agreement.id,
                    opportunityId: input.opportunityId ?? "",
                    customerMemberId: facts.customerMemberId,
                    siteLocationId: facts.siteLocationId,
                    sourceKey: input.sourceKey,
                    ctx: { actorUserId: input.actorUserId, correlationId: input.correlationId },
                });
            }
        } catch (e) {
            result.agreement = {
                outcome: "error",
                error:
                    e instanceof OperationalEnrollmentServiceError || e instanceof Error
                        ? e.message
                        : "Agreement creation failed",
            };
            return result;
        }
    }

    // --- Placement (program/room/site) ---
    const programCategoryId = trimOrNull(facts.programCategoryId);
    const roomLocationId = trimOrNull(facts.roomLocationId);
    if (!programCategoryId && !roomLocationId) {
        result.placement = { outcome: "skipped", warning: "no_program_or_room_fields" };
    } else {
        const existing = await getOperationalPlacementForAgreement(supabase, orgId, agreement.id);
        if (existing) {
            result.placement = { outcome: "reused", id: existing.id };
        } else {
            try {
                const placement = await createInitialChildPlacement(supabase, {
                    orgId,
                    enrollmentAgreementId: agreement.id,
                    startDate: facts.startDate,
                    programCategoryId,
                    roomLocationId,
                    sourceKey: input.sourceKey,
                    metadata: { source_key: input.sourceKey },
                    actorUserId: input.actorUserId,
                    todayYmd: input.todayYmd,
                });
                result.placement = { outcome: "created", id: placement.id };
                if (emitEvents) {
                    await emitPlacementCreatedEvent({
                        orgId,
                        placementId: placement.id,
                        enrollmentAgreementId: agreement.id,
                        customerMemberId: facts.customerMemberId,
                        siteLocationId: facts.siteLocationId,
                        ctx: { actorUserId: input.actorUserId, correlationId: input.correlationId },
                    });
                }
            } catch (e) {
                const message = e instanceof Error ? e.message : "Placement creation failed";
                result.placement = { outcome: "warning", warning: message };
                warnings.push(`placement_warning:${message}`);
            }
        }
    }

    // --- Schedule assignment (schedule pattern) ---
    const explicitPatternId = trimOrNull(facts.schedulePatternId);
    const scheduleType = trimOrNull(facts.scheduleType);
    if (!explicitPatternId && !scheduleType) {
        result.schedule_assignment = { outcome: "skipped", warning: "no_schedule" };
    } else {
        const existing = await getOperationalScheduleAssignmentForAgreement(supabase, orgId, agreement.id);
        if (existing) {
            result.schedule_assignment = { outcome: "reused", id: existing.id };
        } else {
            try {
                const patternId =
                    explicitPatternId ??
                    (await resolveSchedulePatternForScheduleType(
                        supabase,
                        orgId,
                        facts.siteLocationId,
                        scheduleType,
                    ))?.id ??
                    null;
                if (!patternId) {
                    result.schedule_assignment = {
                        outcome: "warning",
                        warning: `no_schedule_pattern_for:${scheduleType}`,
                    };
                    warnings.push(`schedule_pattern_missing:${scheduleType}`);
                } else {
                    const assignment = await createInitialScheduleAssignment(supabase, {
                        orgId,
                        enrollmentAgreementId: agreement.id,
                        schedulePatternId: patternId,
                        startDate: facts.startDate,
                        sourceKey: input.sourceKey,
                        metadata: {
                            source_key: input.sourceKey,
                            ...(scheduleType ? { schedule_type_key: scheduleType } : {}),
                        },
                        actorUserId: input.actorUserId,
                        todayYmd: input.todayYmd,
                    });
                    result.schedule_assignment = { outcome: "created", id: assignment.id };
                    if (emitEvents) {
                        await emitScheduleAssignmentCreatedEvent({
                            orgId,
                            assignmentId: assignment.id,
                            enrollmentAgreementId: agreement.id,
                            schedulePatternId: patternId,
                            customerMemberId: facts.customerMemberId,
                            ctx: { actorUserId: input.actorUserId, correlationId: input.correlationId },
                        });
                    }
                }
            } catch (e) {
                const message = e instanceof Error ? e.message : "Schedule assignment failed";
                result.schedule_assignment = { outcome: "warning", warning: message };
                warnings.push(`schedule_assignment_warning:${message}`);
            }
        }
    }

    result.warnings = warnings;
    return result;
}
