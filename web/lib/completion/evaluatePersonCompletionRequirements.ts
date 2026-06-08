import { resolvePersonDrawerProfile } from "@/lib/admin/person/resolvePersonDrawerProfile";
import { PERSON_DRAWER_CHILD_START_DATE_KEY } from "@/lib/admin/person/personDrawerChildLifecycleFields";
import {
    buildRequirementValidationResult,
    makeRequirementViolation,
} from "@/lib/completion/requirementValidationResult";
import type {
    CompletionEvaluationContext,
    RequirementValidationResult,
} from "@/lib/completion/requirementValidationTypes";
import { completionValueEmpty, trimOrNull } from "@/lib/completion/valueEmpty";

const CHILD_ACTIVE_STATUS_KEYS = new Set(["active", "future_start", "enrolled"]);

function resolvePersonProfiles(ctx: CompletionEvaluationContext): string[] {
    if (ctx.profile_keys?.length) return ctx.profile_keys;
    const rel = ctx.related;
    const resolved = resolvePersonDrawerProfile({
        person_id: ctx.entity_id,
        is_employee: ctx.values.is_employee as boolean | null | undefined,
        customer_persons: rel?.customer_persons ?? null,
        person_relationships: rel?.person_relationships ?? null,
        customer_members: rel?.customer_members ?? null,
        opportunity_person_roles: rel?.opportunity_person_roles ?? null,
    });
    return resolved.profiles;
}

function isParentLike(profiles: string[]): boolean {
    return profiles.includes("parent") || profiles.includes("guardian");
}

function isChild(profiles: string[]): boolean {
    return profiles.includes("child");
}

function mergedPersonValues(ctx: CompletionEvaluationContext): Record<string, unknown> {
    return ctx.values;
}

function fieldMissingViolation(
    ctx: CompletionEvaluationContext,
    input: {
        field_key: string;
        label: string;
        requirement_type: "always_required" | "required_on_save" | "required_before_status_transition" | "recommended_non_blocking";
        blocking_level: "hard_block" | "soft_warning" | "recommendation";
        missing_reason: string;
        section_key?: string;
    }
) {
    return makeRequirementViolation({
        entity_type: "person",
        entity_id: ctx.entity_id,
        field_key: input.field_key,
        section_key: input.section_key,
        label: input.label,
        requirement_type: input.requirement_type,
        blocking_level: input.blocking_level,
        missing_reason: input.missing_reason,
        context: {
            surface: ctx.surface,
            layout_variant_key: ctx.layout_variant_key,
            status_from: trimOrNull(ctx.status_from) ?? undefined,
            status_to: trimOrNull(ctx.status_to) ?? undefined,
            action_key: trimOrNull(ctx.action_key) ?? undefined,
            profile_key: ctx.profile_keys?.[0],
        },
    });
}

/**
 * Code-based person completion rules (Sprint B vertical slice).
 * Evaluated by entity/field key — not bound to drawer JSX (Sprint A safe).
 */
export function evaluatePersonCompletionRequirements(
    ctx: CompletionEvaluationContext
): RequirementValidationResult {
    const phase = ctx.phase;
    const values = mergedPersonValues(ctx);
    const profiles = resolvePersonProfiles(ctx);
    const violations = [];

    const firstName = values.first_name;
    const lastName = values.last_name;
    const email = values.email;
    const phone = values.phone;
    const dob = values.date_of_birth ?? values.dob;
    const startDate = values[PERSON_DRAWER_CHILD_START_DATE_KEY] ?? values.start_date;
    const statusKey = trimOrNull(values.status_key);
    const isEmployee = values.is_employee === true;
    const employeeId = values.employee_id ?? values.employeeId;

    if (isEmployee && completionValueEmpty(employeeId)) {
        violations.push(
            fieldMissingViolation(ctx, {
                field_key: "employee_id",
                label: "Employee ID",
                requirement_type: "recommended_non_blocking",
                blocking_level: "recommendation",
                missing_reason: "Employee ID is recommended for employee families (used for waitlist priority).",
                section_key: "employee_status",
            })
        );
    }

    if (completionValueEmpty(firstName)) {
        violations.push(
            fieldMissingViolation(ctx, {
                field_key: "first_name",
                label: "First name",
                requirement_type: "always_required",
                blocking_level: "hard_block",
                missing_reason: "First name is required.",
                section_key: "identity",
            })
        );
    }

    if (completionValueEmpty(lastName)) {
        violations.push(
            fieldMissingViolation(ctx, {
                field_key: "last_name",
                label: "Last name",
                requirement_type: "always_required",
                blocking_level: "hard_block",
                missing_reason: "Last name is required.",
                section_key: "identity",
            })
        );
    }

    if (isParentLike(profiles)) {
        const contactMissing = completionValueEmpty(email) && completionValueEmpty(phone);
        if (contactMissing) {
            const blockingOnSave = phase === "save" || phase === "status_change" || phase === "action";
            violations.push(
                fieldMissingViolation(ctx, {
                    field_key: "email",
                    label: "Email or phone",
                    requirement_type: blockingOnSave ? "required_on_save" : "recommended_non_blocking",
                    blocking_level: phase === "preview" ? "recommendation" : "soft_warning",
                    missing_reason: "At least one contact method (email or phone) is required.",
                    section_key: "contact",
                })
            );
        }
    }

    if (isChild(profiles)) {
        const targetStatus = trimOrNull(ctx.status_to) ?? statusKey;
        const requiresEnrollmentFields =
            phase === "status_change"
                ? targetStatus != null && CHILD_ACTIVE_STATUS_KEYS.has(targetStatus)
                : statusKey != null && CHILD_ACTIVE_STATUS_KEYS.has(statusKey);

        if (completionValueEmpty(dob)) {
            violations.push(
                fieldMissingViolation(ctx, {
                    field_key: "date_of_birth",
                    label: "Date of birth",
                    requirement_type: requiresEnrollmentFields
                        ? "required_before_status_transition"
                        : "recommended_non_blocking",
                    blocking_level: requiresEnrollmentFields ? "hard_block" : "recommendation",
                    missing_reason: requiresEnrollmentFields
                        ? "Date of birth is required before active enrollment."
                        : "Date of birth is recommended for child records.",
                    section_key: "identity",
                })
            );
        }

        if (requiresEnrollmentFields && completionValueEmpty(startDate)) {
            violations.push(
                fieldMissingViolation(ctx, {
                    field_key: PERSON_DRAWER_CHILD_START_DATE_KEY,
                    label: "Start date",
                    requirement_type: "required_before_status_transition",
                    blocking_level: "hard_block",
                    missing_reason: "Start date is required before active or future-start status.",
                    section_key: "enrollment",
                })
            );
        }
    }

    return buildRequirementValidationResult(violations);
}
