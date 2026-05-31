/**
 * Seeded lifecycle action requirement rules (MVP childcare enrollment pipeline).
 * Source of truth until Settings authoring ships — not a parallel rules engine.
 */

import { APPROVE_ENROLLMENT_ACTION_KEY, ENROLLED_STATUS_KEY } from "@/lib/admin/actions/enrollmentApprovalConstants";
import {
    OPPORTUNITY_TOUR_COMPLETED_DATE_METADATA_KEY,
    OPPORTUNITY_WAITLIST_DATE_METADATA_KEY,
    WAITLISTED_STATUS_KEY,
} from "@/lib/admin/actions/lifecycleActionMetadataKeys";
import type { AutoPopulateInstruction } from "@/lib/completion/effectiveRequirementsTypes";
import {
    makeRequirementViolation,
    buildRequirementValidationResult,
} from "@/lib/completion/requirementValidationResult";
import type {
    CompletionEvaluationContext,
    InquiryChildCompletionSnapshot,
    RequirementValidationResult,
} from "@/lib/completion/requirementValidationTypes";
import { completionValueEmpty, trimOrNull } from "@/lib/completion/valueEmpty";

export const LIFECYCLE_PREFLIGHT_ACTION_KEYS = [
    APPROVE_ENROLLMENT_ACTION_KEY,
    "move_to_waitlist",
    "schedule_tour",
    "record_tour_outcome",
] as const;

export type LifecyclePreflightActionKey = (typeof LIFECYCLE_PREFLIGHT_ACTION_KEYS)[number];

function inquiryChildren(ctx: CompletionEvaluationContext): InquiryChildCompletionSnapshot[] {
    return ctx.related?.inquiry_children ?? [];
}

function childHasProgram(child: InquiryChildCompletionSnapshot): boolean {
    return (
        !completionValueEmpty(child.desired_program_type) ||
        !completionValueEmpty(child.program_room_cohort_key)
    );
}

function actionViolation(
    ctx: CompletionEvaluationContext,
    input: {
        field_key: string;
        label: string;
        missing_reason: string;
        blocking_level: "hard_block" | "recommendation";
        entity_type?: string;
        entity_id?: string;
        resolution_field_key?: string;
    }
) {
    return makeRequirementViolation({
        entity_type: input.entity_type ?? "opportunity",
        entity_id: input.entity_id ?? ctx.entity_id,
        field_key: input.field_key,
        label: input.label,
        requirement_type:
            input.blocking_level === "hard_block" ? "required_before_action" : "recommended_non_blocking",
        blocking_level: input.blocking_level,
        missing_reason: input.missing_reason,
        context: {
            surface: ctx.surface,
            action_key: trimOrNull(ctx.action_key) ?? undefined,
            status_to: trimOrNull(ctx.status_to) ?? undefined,
        },
    });
}

function requireAtLeastOneChild(ctx: CompletionEvaluationContext) {
    const children = inquiryChildren(ctx);
    if (children.length === 0) {
        return [
            actionViolation(ctx, {
                field_key: "inquiry_children",
                label: "Child",
                missing_reason: "Add at least one child before continuing.",
                blocking_level: "hard_block",
            }),
        ];
    }
    return [];
}

function requireChildAndProgram(ctx: CompletionEvaluationContext) {
    const violations = [...requireAtLeastOneChild(ctx)];
    for (const child of inquiryChildren(ctx)) {
        const childId = trimOrNull(child.person_id) ?? trimOrNull(child.id) ?? "unknown";
        if (!childHasProgram(child)) {
            violations.push(
                actionViolation(ctx, {
                    field_key: "desired_program_type",
                    label: "Program",
                    missing_reason: "Program or classroom interest is required for each child.",
                    blocking_level: "hard_block",
                    entity_type: "inquiry_child",
                    entity_id: childId,
                    resolution_field_key: "desired_program_type",
                })
            );
        }
    }
    return violations;
}

function evaluateApproveEnrollmentAction(ctx: CompletionEvaluationContext): RequirementValidationResult {
    const violations = [...requireAtLeastOneChild(ctx)];

    for (const child of inquiryChildren(ctx)) {
        const childId = trimOrNull(child.person_id) ?? trimOrNull(child.id) ?? "unknown";
        if (completionValueEmpty(child.person_id)) {
            violations.push(
                actionViolation(ctx, {
                    field_key: "person_id",
                    label: "Child identity",
                    missing_reason: "Each child must be linked to a person record before enrollment approval.",
                    blocking_level: "hard_block",
                    entity_type: "inquiry_child",
                    entity_id: childId,
                })
            );
        }
        if (completionValueEmpty(child.program_room_cohort_key)) {
            violations.push(
                actionViolation(ctx, {
                    field_key: "program_room_cohort_key",
                    label: "Classroom",
                    missing_reason: "Classroom or placement target is required before enrollment approval.",
                    blocking_level: "hard_block",
                    entity_type: "inquiry_child",
                    entity_id: childId,
                    resolution_field_key: "program_room_cohort_key",
                })
            );
        }
        if (completionValueEmpty(child.desired_schedule_type)) {
            violations.push(
                actionViolation(ctx, {
                    field_key: "desired_schedule_type",
                    label: "Schedule",
                    missing_reason: "Schedule is required before enrollment approval.",
                    blocking_level: "hard_block",
                    entity_type: "inquiry_child",
                    entity_id: childId,
                    resolution_field_key: "desired_schedule_type",
                })
            );
        }
        if (completionValueEmpty(child.desired_start_date)) {
            violations.push(
                actionViolation(ctx, {
                    field_key: "desired_start_date",
                    label: "Start date",
                    missing_reason: "Start date is required before enrollment approval.",
                    blocking_level: "hard_block",
                    entity_type: "inquiry_child",
                    entity_id: childId,
                    resolution_field_key: "desired_start_date",
                })
            );
        }
    }

    return buildRequirementValidationResult(violations);
}

function evaluateMoveToWaitlistAction(ctx: CompletionEvaluationContext): RequirementValidationResult {
    return buildRequirementValidationResult(requireChildAndProgram(ctx));
}

function evaluateScheduleTourAction(ctx: CompletionEvaluationContext): RequirementValidationResult {
    const violations = requireChildAndProgram(ctx);
    const values = ctx.values;
    const email = values.email ?? values.parent_email;
    const phone = values.phone ?? values.parent_phone;
    const primary = values.primary_person_id ?? values.primary_contact_id;
    if (completionValueEmpty(primary) && completionValueEmpty(email) && completionValueEmpty(phone)) {
        violations.push(
            actionViolation(ctx, {
                field_key: "primary_person_id",
                label: "Primary contact",
                missing_reason: "A primary contact with phone or email is recommended before scheduling a tour.",
                blocking_level: "recommendation",
            })
        );
    }
    const tourDate = values.tour_date ?? metadataValue(values, "tour_date");
    const tourTime = values.tour_time ?? metadataValue(values, "tour_time");
    if (completionValueEmpty(tourDate) || completionValueEmpty(tourTime)) {
        violations.push(
            actionViolation(ctx, {
                field_key: "tour_date",
                label: "Tour date and time",
                missing_reason: "Preferred tour date and time are recommended when scheduling.",
                blocking_level: "recommendation",
            })
        );
    }
    return buildRequirementValidationResult(violations);
}

function metadataValue(values: Record<string, unknown>, key: string): unknown {
    const meta = values.metadata;
    if (meta && typeof meta === "object" && !Array.isArray(meta)) {
        return (meta as Record<string, unknown>)[key];
    }
    return undefined;
}

function evaluateRecordTourOutcomeAction(
    ctx: CompletionEvaluationContext,
    payload?: Record<string, unknown>
): RequirementValidationResult {
    const outcome =
        payload?.outcome != null
            ? String(payload.outcome).trim()
            : ctx.values.outcome != null
              ? String(ctx.values.outcome).trim()
              : "";
    if (outcome !== "completed" && outcome !== "no_show") {
        return buildRequirementValidationResult([
            actionViolation(ctx, {
                field_key: "outcome",
                label: "Tour outcome",
                missing_reason: "Select a tour outcome (completed or no-show).",
                blocking_level: "hard_block",
                resolution_field_key: "outcome",
            }),
        ]);
    }
    return buildRequirementValidationResult([]);
}

/** Auto-populate instructions for successful action execution (applied by execute layer). */
export function autoPopulateForLifecycleAction(
    actionKey: string,
    input: { opportunityId: string; payload?: Record<string, unknown>; today?: string }
): AutoPopulateInstruction[] {
    const today = input.today ?? new Date().toISOString().slice(0, 10);
    const key = actionKey.trim();

    if (key === APPROVE_ENROLLMENT_ACTION_KEY) {
        return [
            {
                entity_type: "opportunity",
                entity_id: input.opportunityId,
                field_key: "enrollment_date",
                metadata_key: "enrollment_date",
                value: today,
            },
        ];
    }
    if (key === "move_to_waitlist") {
        return [
            {
                entity_type: "opportunity",
                entity_id: input.opportunityId,
                field_key: "waitlist_date",
                metadata_key: OPPORTUNITY_WAITLIST_DATE_METADATA_KEY,
                value: today,
            },
        ];
    }
    if (key === "record_tour_outcome") {
        const outcome = input.payload?.outcome != null ? String(input.payload.outcome).trim() : "";
        if (outcome === "completed") {
            return [
                {
                    entity_type: "opportunity",
                    entity_id: input.opportunityId,
                    field_key: OPPORTUNITY_TOUR_COMPLETED_DATE_METADATA_KEY,
                    metadata_key: OPPORTUNITY_TOUR_COMPLETED_DATE_METADATA_KEY,
                    value: today,
                },
            ];
        }
    }
    return [];
}

/** Action-scoped rules from the lifecycle catalog (source: action). */
export function evaluateLifecycleActionRequirements(
    ctx: CompletionEvaluationContext,
    payload?: Record<string, unknown>
): RequirementValidationResult {
    const actionKey = trimOrNull(ctx.action_key);
    if (!actionKey) return { ok: true, blocking: [], warnings: [], recommendations: [] };

    switch (actionKey) {
        case APPROVE_ENROLLMENT_ACTION_KEY:
            return evaluateApproveEnrollmentAction({
                ...ctx,
                status_to: ctx.status_to ?? ENROLLED_STATUS_KEY,
            });
        case "move_to_waitlist":
            return evaluateMoveToWaitlistAction({
                ...ctx,
                status_to: ctx.status_to ?? WAITLISTED_STATUS_KEY,
            });
        case "schedule_tour":
            return evaluateScheduleTourAction(ctx);
        case "record_tour_outcome":
            return evaluateRecordTourOutcomeAction(ctx, payload);
        default:
            return { ok: true, blocking: [], warnings: [], recommendations: [] };
    }
}

export function isLifecyclePreflightActionKey(actionKey: string): boolean {
    return (LIFECYCLE_PREFLIGHT_ACTION_KEYS as readonly string[]).includes(actionKey.trim());
}

export function lifecycleActionTargetStatus(actionKey: string): string | null {
    const key = actionKey.trim();
    if (key === APPROVE_ENROLLMENT_ACTION_KEY) return ENROLLED_STATUS_KEY;
    if (key === "move_to_waitlist") return WAITLISTED_STATUS_KEY;
    if (key === "schedule_tour") return "tour_scheduled";
    return null;
}
