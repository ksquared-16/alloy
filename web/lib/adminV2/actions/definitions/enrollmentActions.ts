/**
 * Registered actions: `enrollment.start` and `enrollment.direct`.
 *
 * Both take the DURABLE CHILD as their subject — `customer_members.id` — because both answer a
 * question about a child who already exists. Neither is a creation path, and neither may become
 * one: `child.add` remains the single operator route to a Child record.
 *
 * The two are genuinely different intents, not two buttons for one:
 *
 *   enrollment.start   run the governed journey   → one process_instance, no durable facts
 *   enrollment.direct  skip the journey           → the durable trio, no process_instance
 *
 * @see web/lib/records/startEnrollmentService.ts
 * @see web/lib/records/directEnrollService.ts
 */

import { randomUUID } from "crypto";

import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";
import { RecordCreationError, recordCreationErrorStatus } from "@/lib/records/recordCreationErrors";
import { resolveLiveEnrollmentContextForHousehold } from "@/lib/records/enrollmentContextResolver";
import { startEnrollment } from "@/lib/records/startEnrollmentService";
import {
    directEnroll,
    DirectEnrollNotReadyError,
    evaluateDirectEnrollReadiness,
} from "@/lib/records/directEnrollService";

export const ENROLLMENT_START_ACTION_KEY = "enrollment.start";
export const ENROLLMENT_DIRECT_ACTION_KEY = "enrollment.direct";

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

/** Both actions target an existing child, so the subject is a real record id, not a sentinel. */
const CHILD_SUBJECT = {
    supportedEntityTypes: ["child"] as const,
    supportedProcessKeys: [] as const,
    requiredContext: { requiresEntityId: true, requiresOpportunity: false, requiresCustomer: false },
};

async function householdForMember(
    supabase: Parameters<NonNullable<RegisteredAction["buildPreview"]>>[0]["supabase"],
    orgId: string,
    customerMemberId: string
): Promise<string | null> {
    const { data } = await supabase
        .from("customer_members")
        .select("customer_id")
        .eq("org_id", orgId)
        .eq("id", customerMemberId)
        .maybeSingle();
    return ((data as { customer_id?: string | null } | null)?.customer_id ?? "").trim() || null;
}

export const enrollmentStartAction: RegisteredAction = {
    actionKey: ENROLLMENT_START_ACTION_KEY,
    defaultLabel: "Start enrollment",
    description:
        "Begin the configured enrollment process for an existing child. Creates no opportunity and no enrollment agreement.",
    ...CHILD_SUBJECT,
    audit: { eventType: "action_executed", category: "record", mutates: true },
    confirmationPolicy: "required",
    bosProposalSupport: false,

    validatePayload(payload) {
        return { ok: true, value: { ...(payload ?? {}) } };
    },

    async resolveEligibility({ invocation }) {
        const blockers: { code: string; message: string; field?: string }[] = [];
        if (!t(invocation.entityId)) {
            blockers.push({
                code: "missing_child",
                message: "Select the child to start enrollment for",
                field: "entity_id",
            });
        }
        return { eligible: blockers.length === 0, blockers, availableTransitions: [], requiredInputs: [] };
    },

    /**
     * Preview states which context the journey will run in, because "joins the family's current
     * enrolment" and "starts a fresh, unattached journey" are materially different answers and the
     * operator should not discover which one happened afterwards.
     */
    async buildPreview({ supabase, ctx, invocation, payload }) {
        const customerMemberId = t(invocation.entityId);
        const forceContextFree = payload?.force_context_free === true;
        const customerId = await householdForMember(supabase, ctx.orgId, customerMemberId);

        const resolved =
            customerId && !forceContextFree
                ? await resolveLiveEnrollmentContextForHousehold(supabase, ctx.orgId, customerId)
                : { context: null, consideredOpportunityIds: [] };

        const NEVER = [
            "No opportunity is created",
            "No enrollment agreement, placement or schedule is created yet",
        ];

        if (resolved.context) {
            return {
                summary: "Start enrollment inside the family's current enrolment episode.",
                changes: [
                    "Create one enrollment process for this child",
                    "Join the household's live episode as context",
                    ...NEVER,
                ],
                before: { opportunity_id: resolved.context.opportunityId },
            };
        }

        return {
            summary: "Start a new enrollment process for this child.",
            changes: [
                "Create one enrollment process for this child",
                resolved.consideredOpportunityIds.length > 0
                    ? "The household has no live enrolment episode — earlier ones stay closed"
                    : "The household has no enrolment episode — the process runs on its own",
                ...NEVER,
            ],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        try {
            const result = await startEnrollment(supabase, {
                orgId: ctx.orgId,
                customerMemberId: t(invocation.entityId),
                forceContextFree: payload?.force_context_free === true,
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: ENROLLMENT_START_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: result.customerMemberId,
                    affectedId: result.processInstanceId,
                    detail: {
                        process_instance_id: result.processInstanceId,
                        customer_member_id: result.customerMemberId,
                        opportunity_id: result.opportunityId,
                        context_outcome: result.contextOutcome,
                        reused: result.reused,
                    },
                },
            };
        } catch (err) {
            if (err instanceof RecordCreationError) {
                return {
                    ok: false,
                    correlationId,
                    status: recordCreationErrorStatus(err.code),
                    error: err.message,
                };
            }
            throw err;
        }
    },
};

export const enrollmentDirectAction: RegisteredAction = {
    actionKey: ENROLLMENT_DIRECT_ACTION_KEY,
    defaultLabel: "Enroll directly",
    description:
        "Enroll an existing child without the acquisition journey, establishing the durable agreement, placement and schedule.",
    ...CHILD_SUBJECT,
    audit: { eventType: "action_executed", category: "record", mutates: true },
    confirmationPolicy: "required",
    bosProposalSupport: false,

    validatePayload(payload) {
        const src = payload ?? {};
        const value: Record<string, unknown> = { ...src };
        for (const key of [
            "site_location_id",
            "start_date",
            "program_category_id",
            "room_location_id",
            "schedule_type",
            "schedule_pattern_id",
        ]) {
            if (src[key] != null) value[key] = t(src[key]);
        }
        return { ok: true, value };
    },

    /**
     * Eligibility IS the readiness evaluation. A second list of required fields here could disagree
     * with what execute enforces, and the operator would meet one set of rules and fail the other.
     */
    async resolveEligibility({ supabase, ctx, invocation, payload }) {
        const readiness = await evaluateDirectEnrollReadiness(supabase, {
            orgId: ctx.orgId,
            customerMemberId: t(invocation.entityId),
            siteLocationId: t(payload?.site_location_id),
            startDate: t(payload?.start_date),
            programCategoryId: t(payload?.program_category_id) || null,
            roomLocationId: t(payload?.room_location_id) || null,
            schedulePatternId: t(payload?.schedule_pattern_id) || null,
            scheduleType: t(payload?.schedule_type) || null,
        });

        return {
            eligible: readiness.ready,
            blockers: readiness.blockers.map((b) => ({
                code: b.code,
                message: b.message,
                field: b.field ?? undefined,
            })),
            availableTransitions: [],
            requiredInputs: [
                { key: "site_location_id", label: "Site", type: "select", required: true },
                { key: "start_date", label: "Start date", type: "date", required: true },
                { key: "program_category_id", label: "Program", type: "select", required: false },
                { key: "room_location_id", label: "Room", type: "select", required: false },
                { key: "schedule_type", label: "Schedule", type: "select", required: true },
            ],
        };
    },

    async buildPreview({ supabase, ctx, invocation, payload }) {
        const readiness = await evaluateDirectEnrollReadiness(supabase, {
            orgId: ctx.orgId,
            customerMemberId: t(invocation.entityId),
            siteLocationId: t(payload?.site_location_id),
            startDate: t(payload?.start_date),
            programCategoryId: t(payload?.program_category_id) || null,
            roomLocationId: t(payload?.room_location_id) || null,
            schedulePatternId: t(payload?.schedule_pattern_id) || null,
            scheduleType: t(payload?.schedule_type) || null,
        });

        if (!readiness.ready) {
            return {
                summary: "This child cannot be enrolled directly yet.",
                changes: [
                    ...readiness.blockers.map((b) => b.message),
                    "Nothing is written until every one of these is resolved",
                ],
                before: { blockers: readiness.blockers },
            };
        }

        return {
            summary: `Enroll this child directly, effective ${t(payload?.start_date)}.`,
            changes: [
                "Create the enrollment agreement",
                "Create the placement",
                "Create the schedule assignment",
                "No enrollment process is created — no journey was run, and none is invented",
                "No opportunity is created",
                ...readiness.warnings,
            ],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        try {
            const todayYmd = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
            const result = await directEnroll(supabase, {
                orgId: ctx.orgId,
                customerMemberId: t(invocation.entityId),
                siteLocationId: t(payload.site_location_id),
                startDate: t(payload.start_date),
                programCategoryId: t(payload.program_category_id) || null,
                roomLocationId: t(payload.room_location_id) || null,
                schedulePatternId: t(payload.schedule_pattern_id) || null,
                scheduleType: t(payload.schedule_type) || null,
                todayYmd,
                actorUserId: ctx.userId ?? null,
            });

            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: ENROLLMENT_DIRECT_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: result.customerMemberId,
                    affectedId: result.agreementId ?? result.customerMemberId,
                    detail: {
                        customer_member_id: result.customerMemberId,
                        agreement_id: result.agreementId,
                        placement_id: result.placementId,
                        schedule_assignment_id: result.scheduleAssignmentId,
                        warnings: result.trio.warnings,
                    },
                },
            };
        } catch (err) {
            if (err instanceof DirectEnrollNotReadyError) {
                return {
                    ok: false,
                    correlationId,
                    status: 422,
                    error: err.message,
                    blockers: err.blockers,
                };
            }
            if (err instanceof RecordCreationError) {
                return {
                    ok: false,
                    correlationId,
                    status: recordCreationErrorStatus(err.code),
                    error: err.message,
                };
            }
            throw err;
        }
    },
};
