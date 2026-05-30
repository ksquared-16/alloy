import {
    buildRequirementValidationResult,
    makeRequirementViolation,
} from "@/lib/completion/requirementValidationResult";
import type {
    CompletionEvaluationContext,
    InquiryChildCompletionSnapshot,
    RequirementValidationResult,
} from "@/lib/completion/requirementValidationTypes";
import { completionValueEmpty, trimOrNull } from "@/lib/completion/valueEmpty";

const LOCATION_PROGRAM_STATUSES = new Set([
    "tour_scheduled",
    "tour_requested",
    "waitlisted",
    "ready_to_enroll",
    "enrolled",
]);

const PROGRAM_REQUIRED_STATUSES = new Set(["waitlisted", "ready_to_enroll", "enrolled"]);

const ENROLLED_STATUSES = new Set(["enrolled", "ready_to_enroll"]);

function metadataValue(values: Record<string, unknown>, key: string): unknown {
    const meta = values.metadata;
    if (meta && typeof meta === "object" && !Array.isArray(meta)) {
        return (meta as Record<string, unknown>)[key];
    }
    return undefined;
}

function mergedTourDate(values: Record<string, unknown>): unknown {
    return values.tour_date ?? metadataValue(values, "tour_date");
}

function mergedTourTime(values: Record<string, unknown>): unknown {
    return values.tour_time ?? metadataValue(values, "tour_time");
}

function inquiryChildren(ctx: CompletionEvaluationContext): InquiryChildCompletionSnapshot[] {
    return ctx.related?.inquiry_children ?? [];
}

function childHasProgram(child: InquiryChildCompletionSnapshot): boolean {
    return (
        !completionValueEmpty(child.desired_program_type) ||
        !completionValueEmpty(child.program_room_cohort_key)
    );
}

function childHasLocation(child: InquiryChildCompletionSnapshot): boolean {
    return !completionValueEmpty(child.location_id);
}

function oppViolation(
    ctx: CompletionEvaluationContext,
    input: {
        field_key?: string;
        label: string;
        requirement_type:
            | "always_required"
            | "required_before_status_transition"
            | "recommended_non_blocking";
        blocking_level: "hard_block" | "soft_warning" | "recommendation";
        missing_reason: string;
        entity_id?: string;
        entity_type?: string;
    }
) {
    return makeRequirementViolation({
        entity_type: input.entity_type ?? "opportunity",
        entity_id: input.entity_id ?? ctx.entity_id,
        field_key: input.field_key,
        label: input.label,
        requirement_type: input.requirement_type,
        blocking_level: input.blocking_level,
        missing_reason: input.missing_reason,
        context: {
            surface: ctx.surface,
            status_from: trimOrNull(ctx.status_from) ?? undefined,
            status_to: trimOrNull(ctx.status_to) ?? undefined,
            action_key: trimOrNull(ctx.action_key) ?? undefined,
        },
    });
}

/**
 * Code-based opportunity completion rules (Sprint B vertical slice).
 */
export function evaluateOpportunityCompletionRequirements(
    ctx: CompletionEvaluationContext
): RequirementValidationResult {
    const values = ctx.values;
    const phase = ctx.phase;
    const targetStatus =
        phase === "status_change" ? trimOrNull(ctx.status_to) : trimOrNull(values.status_key);
    const violations = [];

    const primaryPersonId = values.primary_person_id ?? values.primary_contact_id;
    if (completionValueEmpty(primaryPersonId)) {
        violations.push(
            oppViolation(ctx, {
                field_key: "primary_person_id",
                label: "Primary contact",
                requirement_type: "always_required",
                blocking_level: phase === "preview" ? "soft_warning" : "hard_block",
                missing_reason: "Opportunity must have a primary contact.",
            })
        );
    }

    const children = inquiryChildren(ctx);
    if (children.length === 0) {
        violations.push(
            oppViolation(ctx, {
                field_key: "inquiry_children",
                label: "At least one child",
                requirement_type: "always_required",
                blocking_level: phase === "preview" ? "soft_warning" : "hard_block",
                missing_reason: "Opportunity must include at least one child on the inquiry.",
            })
        );
    }

    if (targetStatus === "tour_scheduled") {
        if (completionValueEmpty(mergedTourDate(values))) {
            violations.push(
                oppViolation(ctx, {
                    field_key: "tour_date",
                    label: "Tour date",
                    requirement_type: "required_before_status_transition",
                    blocking_level: "hard_block",
                    missing_reason: "Tour date is required before Tour Scheduled.",
                })
            );
        }
        if (completionValueEmpty(mergedTourTime(values))) {
            violations.push(
                oppViolation(ctx, {
                    field_key: "tour_time",
                    label: "Tour time",
                    requirement_type: "required_before_status_transition",
                    blocking_level: "hard_block",
                    missing_reason: "Tour time is required before Tour Scheduled.",
                })
            );
        }
    }

    if (targetStatus && LOCATION_PROGRAM_STATUSES.has(targetStatus)) {
        const oppLocation = values.location_id;
        const childLocations = children.filter((c) => childHasLocation(c));
        if (completionValueEmpty(oppLocation) && childLocations.length === 0) {
            violations.push(
                oppViolation(ctx, {
                    field_key: "location_id",
                    label: "Location / site",
                    requirement_type: "required_before_status_transition",
                    blocking_level: "hard_block",
                    missing_reason: "Location or site is required before tour, waitlist, or enrollment.",
                })
            );
        }
    }

    if (targetStatus && PROGRAM_REQUIRED_STATUSES.has(targetStatus)) {
        const hasProgram = children.some((c) => childHasProgram(c));
        if (!hasProgram) {
            violations.push(
                oppViolation(ctx, {
                    field_key: "desired_program_type",
                    label: "Program / category",
                    requirement_type: "required_before_status_transition",
                    blocking_level: "hard_block",
                    missing_reason: "Program or category is required before waitlist or enrollment.",
                })
            );
        }
    }

    if (targetStatus && ENROLLED_STATUSES.has(targetStatus)) {
        for (const child of children) {
            const childId = trimOrNull(child.person_id) ?? trimOrNull(child.id) ?? "unknown";
            if (completionValueEmpty(child.first_name) && completionValueEmpty(child.last_name)) {
                violations.push(
                    oppViolation(ctx, {
                        entity_type: "inquiry_child",
                        entity_id: childId,
                        field_key: "first_name",
                        label: "Child name",
                        requirement_type: "required_before_status_transition",
                        blocking_level: "hard_block",
                        missing_reason: "Each enrolled child must have a name.",
                    })
                );
            }
            if (completionValueEmpty(child.desired_start_date)) {
                violations.push(
                    oppViolation(ctx, {
                        entity_type: "inquiry_child",
                        entity_id: childId,
                        field_key: "desired_start_date",
                        label: "Desired start date",
                        requirement_type: "required_before_status_transition",
                        blocking_level: "hard_block",
                        missing_reason: "Desired start date is required before enrollment.",
                    })
                );
            }
        }
    }

    return buildRequirementValidationResult(violations);
}
