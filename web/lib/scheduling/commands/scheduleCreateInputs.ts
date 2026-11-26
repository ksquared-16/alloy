/**
 * Pure payload / eligibility / preview logic for the `schedule.create` command.
 *
 * Kept separate from the RegisteredAction wiring (mirrors
 * `createLeadRequiredInputs.ts`) so the guessable logic — required inputs,
 * validation, and the preview sentence — is unit-testable without a DB.
 */

import { isValidIsoDateString } from "@/lib/childcareOperational/effectiveDating";
import type {
    ActionEligibility,
    ActionPreview,
    ActionRequiredInput,
    PayloadValidationResult,
} from "@/lib/adminV2/actions/actionTypes";

export const SCHEDULE_CREATE_ACTION_KEY = "schedule.create";

export type ScheduleCreatePayload = {
    enrollment_agreement_id: string;
    schedule_pattern_id: string;
    start_date: string;
    room_location_id?: string | null;
    program_category_id?: string | null;
    /** Optional display labels supplied by the option generator for the preview. */
    room_label?: string | null;
    pattern_label?: string | null;
    child_name?: string | null;
};

export function trimmedValue(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

export const SCHEDULE_CREATE_REQUIRED_INPUTS: ActionRequiredInput[] = [
    { key: "enrollment_agreement_id", label: "Enrollment", type: "text", required: true },
    { key: "schedule_pattern_id", label: "Schedule pattern", type: "select", required: true },
    { key: "start_date", label: "Effective start", type: "date", required: true },
    { key: "room_location_id", label: "Room", type: "select", required: false },
];

/** Validate + normalize the incoming payload. */
export function validateScheduleCreatePayload(
    payload: Record<string, unknown> | undefined
): PayloadValidationResult {
    const src = payload ?? {};
    const value: Record<string, unknown> = { ...src };
    for (const key of [
        "enrollment_agreement_id",
        "schedule_pattern_id",
        "start_date",
        "room_location_id",
        "program_category_id",
        "room_label",
        "pattern_label",
        "child_name",
    ]) {
        if (src[key] != null) value[key] = trimmedValue(src[key]);
    }
    const startDate = trimmedValue(value.start_date);
    if (startDate && !isValidIsoDateString(startDate)) {
        return {
            ok: false,
            blockers: [
                {
                    code: "invalid_start_date",
                    message: "Effective start must be a valid YYYY-MM-DD date.",
                    field: "start_date",
                },
            ],
        };
    }
    return { ok: true, value };
}

/** Read-only eligibility: the three required fields must be present + valid. */
export function buildScheduleCreateEligibility(
    payload: Record<string, unknown> | undefined
): ActionEligibility {
    const src = payload ?? {};
    const agreement = trimmedValue(src.enrollment_agreement_id);
    const pattern = trimmedValue(src.schedule_pattern_id);
    const startDate = trimmedValue(src.start_date);

    const blockers: ActionEligibility["blockers"] = [];
    if (!agreement)
        blockers.push({
            code: "missing_enrollment",
            message: "An enrollment is required to create a schedule.",
            field: "enrollment_agreement_id",
        });
    if (!pattern)
        blockers.push({
            code: "missing_pattern",
            message: "Choose a schedule pattern.",
            field: "schedule_pattern_id",
        });
    if (!startDate)
        blockers.push({
            code: "missing_start_date",
            message: "Choose an effective start date.",
            field: "start_date",
        });
    else if (!isValidIsoDateString(startDate))
        blockers.push({
            code: "invalid_start_date",
            message: "Effective start must be a valid date.",
            field: "start_date",
        });

    return {
        eligible: blockers.length === 0,
        blockers,
        availableTransitions: [],
        requiredInputs: SCHEDULE_CREATE_REQUIRED_INPUTS,
    };
}

/** Read-only dry-run description of what commit will do. */
export function buildScheduleCreatePreview(
    payload: Record<string, unknown> | undefined
): ActionPreview {
    const src = payload ?? {};
    const child = trimmedValue(src.child_name) || "this child";
    const room = trimmedValue(src.room_label);
    const pattern = trimmedValue(src.pattern_label);
    const startDate = trimmedValue(src.start_date);

    const where = room ? ` in ${room}` : "";
    const days = pattern ? `, ${pattern}` : "";
    const from = startDate ? `, from ${startDate}` : "";
    const summary = `Place ${child}${where}${days}${from}.`;

    const changes: string[] = [];
    changes.push(room ? `Placement → ${room}` : "Placement → created");
    changes.push(pattern ? `Schedule → ${pattern}` : "Schedule → created");
    if (startDate) changes.push(`Effective → ${startDate}`);

    return { summary, changes, before: null, after: null };
}
