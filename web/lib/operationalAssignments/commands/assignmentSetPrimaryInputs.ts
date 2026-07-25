/**
 * Pure payload / eligibility / preview for `assignment.set_primary`.
 */

import { isValidIsoDateString } from "@/lib/childcareOperational/effectiveDating";
import type {
    ActionEligibility,
    ActionPreview,
    ActionRequiredInput,
    PayloadValidationResult,
} from "@/lib/adminV2/actions/actionTypes";

export { ASSIGNMENT_SET_PRIMARY_ACTION_KEY } from "@/lib/operationalAssignments/setPrimaryOperationalAssignment";

export function trimmedValue(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

export const ASSIGNMENT_SET_PRIMARY_REQUIRED_INPUTS: ActionRequiredInput[] = [
    { key: "subject_type", label: "Subject type", type: "select", required: true, options: [
        { value: "child", label: "Child" },
        { value: "staff", label: "Staff" },
    ] },
    { key: "effective_date", label: "Effective date", type: "date", required: true },
    { key: "enrollment_agreement_id", label: "Enrollment", type: "text", required: false },
    { key: "person_id", label: "Staff person", type: "text", required: false },
    { key: "site_location_id", label: "Site", type: "select", required: false },
    { key: "promote_assignment_id", label: "Promote assignment", type: "text", required: false },
    { key: "schedule_pattern_id", label: "Schedule pattern", type: "select", required: false },
    { key: "room_location_id", label: "Room", type: "select", required: false },
];

export function validateAssignmentSetPrimaryPayload(
    payload: Record<string, unknown> | undefined
): PayloadValidationResult {
    const src = payload ?? {};
    const value: Record<string, unknown> = { ...src };
    for (const key of [
        "subject_type",
        "effective_date",
        "enrollment_agreement_id",
        "person_id",
        "site_location_id",
        "promote_assignment_id",
        "schedule_pattern_id",
        "room_location_id",
        "program_category_id",
        "assignment_type_id",
        "idempotency_key",
        "subject_label",
        "pattern_label",
        "room_label",
    ]) {
        if (src[key] != null) value[key] = trimmedValue(src[key]);
    }

    const subjectType = trimmedValue(value.subject_type);
    if (subjectType && subjectType !== "child" && subjectType !== "staff") {
        return {
            ok: false,
            blockers: [
                {
                    code: "invalid_subject_type",
                    message: 'subject_type must be "child" or "staff".',
                    field: "subject_type",
                },
            ],
        };
    }

    const effectiveDate = trimmedValue(value.effective_date);
    if (effectiveDate && !isValidIsoDateString(effectiveDate)) {
        return {
            ok: false,
            blockers: [
                {
                    code: "invalid_effective_date",
                    message: "Effective date must be a valid YYYY-MM-DD date.",
                    field: "effective_date",
                },
            ],
        };
    }

    return { ok: true, value };
}

export function buildAssignmentSetPrimaryEligibility(
    payload: Record<string, unknown> | undefined
): ActionEligibility {
    const src = payload ?? {};
    const subjectType = trimmedValue(src.subject_type);
    const effectiveDate = trimmedValue(src.effective_date);
    const promoteId = trimmedValue(src.promote_assignment_id);
    const patternId = trimmedValue(src.schedule_pattern_id);
    const blockers: ActionEligibility["blockers"] = [];

    if (!subjectType) {
        blockers.push({
            code: "missing_subject_type",
            message: "Choose child or staff.",
            field: "subject_type",
        });
    }
    if (!effectiveDate) {
        blockers.push({
            code: "missing_effective_date",
            message: "An effective date is required.",
            field: "effective_date",
        });
    }
    if (subjectType === "child" && !trimmedValue(src.enrollment_agreement_id)) {
        blockers.push({
            code: "missing_enrollment",
            message: "An enrollment is required for a child primary assignment.",
            field: "enrollment_agreement_id",
        });
    }
    if (subjectType === "staff") {
        if (!trimmedValue(src.person_id)) {
            blockers.push({
                code: "missing_person",
                message: "A staff person is required.",
                field: "person_id",
            });
        }
        if (!trimmedValue(src.site_location_id)) {
            blockers.push({
                code: "missing_site",
                message: "A site is required for staff assignments.",
                field: "site_location_id",
            });
        }
    }
    if (!promoteId && !patternId) {
        blockers.push({
            code: "missing_target",
            message: "Promote an existing assignment or supply a schedule pattern.",
            field: "schedule_pattern_id",
        });
    }
    if (promoteId && patternId) {
        blockers.push({
            code: "ambiguous_target",
            message: "Provide either promote_assignment_id or schedule_pattern_id, not both.",
            field: "promote_assignment_id",
        });
    }

    return {
        eligible: blockers.length === 0,
        blockers,
        availableTransitions: [],
        requiredInputs: ASSIGNMENT_SET_PRIMARY_REQUIRED_INPUTS,
    };
}

export function buildAssignmentSetPrimaryPreview(
    payload: Record<string, unknown> | undefined
): ActionPreview {
    const src = payload ?? {};
    const subjectLabel = trimmedValue(src.subject_label) || (trimmedValue(src.subject_type) === "staff" ? "this staff member" : "this child");
    const effectiveDate = trimmedValue(src.effective_date) || "the effective date";
    const room = trimmedValue(src.room_label);
    const pattern = trimmedValue(src.pattern_label);
    const promote = trimmedValue(src.promote_assignment_id);

    const target = promote
        ? "promoted assignment"
        : [room, pattern].filter(Boolean).join(", ") || "new primary assignment";

    return {
        summary: `Set ${subjectLabel}'s primary assignment to ${target}, effective ${effectiveDate}.`,
        changes: [
            "End the current primary the day before the effective date (when present)",
            `Create primary → ${target}`,
            "Preserve effective-dated history",
        ],
        before: null,
        after: {
            is_primary: true,
            effective_date: trimmedValue(src.effective_date) || null,
        },
    };
}
