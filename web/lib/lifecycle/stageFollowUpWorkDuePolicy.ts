/**
 * Follow-up work due policy for stage_operating_plan_v1 outcome rules.
 *
 * Anchors relative scheduling to canonical record/stage facts — not a generic delay only.
 */

export type StageFollowUpDueAnchor =
    | "outcome_recorded_at"
    | "scheduled_event_start"
    | "stage_entered_at"
    | "field_value";

export type StageFollowUpDueOffsetUnit = "minutes" | "hours" | "days" | "weeks" | "months";

export type StageFollowUpMissingAnchorBehavior =
    | "create_without_due_date"
    | "use_outcome_recorded_at"
    | "do_not_create";

export type StageFollowUpWorkDuePolicyV1 = {
    anchor: StageFollowUpDueAnchor;
    field_ref?: string;
    offset_value?: number;
    offset_unit?: StageFollowUpDueOffsetUnit;
    direction?: "before" | "after";
    missing_anchor_behavior?: StageFollowUpMissingAnchorBehavior;
};

export type FollowUpDueResolutionInput = {
    policy: StageFollowUpWorkDuePolicyV1 | null | undefined;
    /** Legacy due_days from persisted targets — treated as outcome_recorded_at + N days after. */
    legacyDueDays?: number | null;
    outcomeRecordedAt: Date;
    scheduledEventStartAt?: string | null;
    stageEnteredAt?: string | null;
    fieldValueAt?: string | null;
};

export type FollowUpDueResolutionResult =
    | { ok: true; dueAt: string | null; skipped?: false }
    | { ok: false; skipped: true; reason: string };

const ANCHORS = new Set<StageFollowUpDueAnchor>([
    "outcome_recorded_at",
    "scheduled_event_start",
    "stage_entered_at",
    "field_value",
]);

const OFFSET_UNITS = new Set<StageFollowUpDueOffsetUnit>(["minutes", "hours", "days", "weeks", "months"]);

export const FOLLOW_UP_OFFSET_UNIT_OPTIONS: Array<{ value: StageFollowUpDueOffsetUnit; label: string }> = [
    { value: "minutes", label: "Minutes" },
    { value: "hours", label: "Hours" },
    { value: "days", label: "Days" },
    { value: "weeks", label: "Weeks" },
    { value: "months", label: "Months" },
];

export type ScheduleTimingUiMode = "immediate" | "before" | "after";

export type ScheduleTimingUi = {
    mode: ScheduleTimingUiMode;
    offset_value: number;
    offset_unit: StageFollowUpDueOffsetUnit;
    anchor: StageFollowUpDueAnchor;
};

export function scheduleTimingUiFromPolicy(policy: StageFollowUpWorkDuePolicyV1): ScheduleTimingUi {
    const offset_value = policy.offset_value ?? 0;
    const offset_unit = policy.offset_unit ?? "days";
    const anchor = policy.anchor ?? "outcome_recorded_at";
    if (offset_value <= 0 && anchor === "outcome_recorded_at") {
        return { mode: "immediate", offset_value: 0, offset_unit, anchor: "outcome_recorded_at" };
    }
    return {
        mode: policy.direction === "before" ? "before" : "after",
        offset_value: Math.max(1, offset_value),
        offset_unit,
        anchor,
    };
}

export function policyFromScheduleTimingUi(timing: ScheduleTimingUi): StageFollowUpWorkDuePolicyV1 {
    if (timing.mode === "immediate") {
        return {
            anchor: "outcome_recorded_at",
            offset_value: 0,
            offset_unit: "days",
            direction: "after",
        };
    }
    return {
        anchor: timing.anchor,
        offset_value: Math.max(1, timing.offset_value || 1),
        offset_unit: timing.offset_unit,
        direction: timing.mode,
    };
}

const MISSING_BEHAVIORS = new Set<StageFollowUpMissingAnchorBehavior>([
    "create_without_due_date",
    "use_outcome_recorded_at",
    "do_not_create",
]);

function trimNonEmpty(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const t = value.trim();
    return t.length > 0 ? t : null;
}

function parseOffsetUnit(raw: unknown): StageFollowUpDueOffsetUnit | null {
    const unit = trimNonEmpty(raw);
    if (!unit || !OFFSET_UNITS.has(unit as StageFollowUpDueOffsetUnit)) return null;
    return unit as StageFollowUpDueOffsetUnit;
}

export function parseStageFollowUpWorkDuePolicyV1(raw: unknown): StageFollowUpWorkDuePolicyV1 | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const anchor = trimNonEmpty(o.anchor);
    if (!anchor || !ANCHORS.has(anchor as StageFollowUpDueAnchor)) return null;

    const policy: StageFollowUpWorkDuePolicyV1 = { anchor: anchor as StageFollowUpDueAnchor };

    const field_ref = trimNonEmpty(o.field_ref);
    if (field_ref) policy.field_ref = field_ref;

    if (typeof o.offset_value === "number" && Number.isFinite(o.offset_value)) {
        policy.offset_value = Math.max(0, Math.floor(o.offset_value));
    }

    const offset_unit = parseOffsetUnit(o.offset_unit);
    if (offset_unit) policy.offset_unit = offset_unit;

    const direction = trimNonEmpty(o.direction);
    if (direction === "before" || direction === "after") policy.direction = direction;

    const missing = trimNonEmpty(o.missing_anchor_behavior);
    if (missing && MISSING_BEHAVIORS.has(missing as StageFollowUpMissingAnchorBehavior)) {
        policy.missing_anchor_behavior = missing as StageFollowUpMissingAnchorBehavior;
    }

    return policy;
}

/** Normalize legacy due_days into a canonical due policy. */
export function duePolicyFromLegacyDays(dueDays: number | null | undefined): StageFollowUpWorkDuePolicyV1 {
    const days =
        typeof dueDays === "number" && Number.isFinite(dueDays) ? Math.max(0, Math.floor(dueDays)) : 0;
    if (days <= 0) {
        return { anchor: "outcome_recorded_at", offset_value: 0, offset_unit: "days", direction: "after" };
    }
    return {
        anchor: "outcome_recorded_at",
        offset_value: days,
        offset_unit: "days",
        direction: "after",
    };
}

export function effectiveFollowUpDuePolicy(
    policy: StageFollowUpWorkDuePolicyV1 | null | undefined,
    legacyDueDays?: number | null,
): StageFollowUpWorkDuePolicyV1 {
    if (policy) return policy;
    return duePolicyFromLegacyDays(legacyDueDays);
}

/** Convert a positive duration to milliseconds (months ≈ 30 days). */
export function durationOffsetToMs(
    offsetValue: number,
    offsetUnit: StageFollowUpDueOffsetUnit = "days",
): number {
    const value = Math.max(0, Math.floor(offsetValue));
    if (value <= 0) return 0;
    switch (offsetUnit) {
        case "minutes":
            return value * 60 * 1000;
        case "hours":
            return value * 60 * 60 * 1000;
        case "weeks":
            return value * 7 * 24 * 60 * 60 * 1000;
        case "months":
            return value * 30 * 24 * 60 * 60 * 1000;
        case "days":
        default:
            return value * 24 * 60 * 60 * 1000;
    }
}

function applyOffset(base: Date, policy: StageFollowUpWorkDuePolicyV1): Date {
    const result = new Date(base);
    const value = policy.offset_value ?? 0;
    const unit = policy.offset_unit ?? "days";
    const direction = policy.direction ?? "after";
    const sign = direction === "before" ? -1 : 1;

    if (value <= 0) return result;

    switch (unit) {
        case "minutes":
            result.setUTCMinutes(result.getUTCMinutes() + sign * value);
            break;
        case "hours":
            result.setUTCHours(result.getUTCHours() + sign * value);
            break;
        case "weeks":
            result.setUTCDate(result.getUTCDate() + sign * value * 7);
            break;
        case "months": {
            const month = result.getUTCMonth() + sign * value;
            result.setUTCMonth(month);
            break;
        }
        case "days":
        default:
            result.setUTCDate(result.getUTCDate() + sign * value);
            break;
    }
    return result;
}

function resolveAnchorDate(input: FollowUpDueResolutionInput, policy: StageFollowUpWorkDuePolicyV1): Date | null {
    switch (policy.anchor) {
        case "outcome_recorded_at":
            return input.outcomeRecordedAt;
        case "scheduled_event_start": {
            const raw = input.scheduledEventStartAt?.trim();
            if (!raw) return null;
            const parsed = new Date(raw);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        }
        case "stage_entered_at": {
            const raw = input.stageEnteredAt?.trim();
            if (!raw) return null;
            const parsed = new Date(raw);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        }
        case "field_value": {
            const raw = input.fieldValueAt?.trim();
            if (!raw) return null;
            const parsed = new Date(raw);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        }
        default:
            return null;
    }
}

export function resolveFollowUpWorkDueAt(input: FollowUpDueResolutionInput): FollowUpDueResolutionResult {
    const policy = effectiveFollowUpDuePolicy(input.policy, input.legacyDueDays);
    const anchorDate = resolveAnchorDate(input, policy);

    if (!anchorDate) {
        const behavior = policy.missing_anchor_behavior ?? "use_outcome_recorded_at";
        if (behavior === "do_not_create") {
            return { ok: false, skipped: true, reason: "missing_anchor" };
        }
        if (behavior === "create_without_due_date") {
            return { ok: true, dueAt: null };
        }
        const fallback = applyOffset(input.outcomeRecordedAt, {
            ...policy,
            anchor: "outcome_recorded_at",
        });
        return { ok: true, dueAt: fallback.toISOString() };
    }

    const dueAt = applyOffset(anchorDate, policy);
    return { ok: true, dueAt: dueAt.toISOString() };
}

export function formatFollowUpDuePolicySummary(
    policy: StageFollowUpWorkDuePolicyV1,
    workLabel: string,
): string {
    const offset = policy.offset_value ?? 0;
    const unit = policy.offset_unit ?? "days";
    const direction = policy.direction ?? "after";
    const unitLabel =
        offset === 1 ?
            unit === "minutes" ? "minute"
            : unit === "hours" ? "hour"
            : unit === "days" ? "day"
            : unit === "weeks" ? "week"
            : "month"
        : unit;

    const anchorLabel: Record<StageFollowUpDueAnchor, string> = {
        outcome_recorded_at: "outcome is recorded",
        scheduled_event_start: "scheduled event",
        stage_entered_at: "stage entry",
        field_value: policy.field_ref?.trim() ? policy.field_ref.replace(/_/g, " ") : "selected date field",
    };

    if (offset <= 0 && policy.anchor === "outcome_recorded_at") {
        return `Create "${workLabel}" immediately after recording`;
    }

    const when = anchorLabel[policy.anchor] ?? policy.anchor;
    if (direction === "before") {
        return `Create "${workLabel}" ${offset} ${unitLabel} before ${when}`;
    }
    return `Create "${workLabel}" ${offset} ${unitLabel} after ${when}`;
}

export function formatScheduleTimingSummary(policy: StageFollowUpWorkDuePolicyV1): string {
    const offset = policy.offset_value ?? 0;
    const unit = policy.offset_unit ?? "days";
    if (offset <= 0 && policy.anchor === "outcome_recorded_at") return "Immediately";
    const unitLabel =
        offset === 1 ?
            unit === "minutes" ? "minute"
            : unit === "hours" ? "hour"
            : unit === "days" ? "day"
            : unit === "weeks" ? "week"
            : "month"
        : unit;
    const direction = policy.direction === "before" ? "before" : "after";
    const when =
        policy.anchor === "scheduled_event_start" ? "scheduled event"
        : policy.anchor === "stage_entered_at" ? "stage entry"
        : policy.anchor === "field_value" ? "selected date"
        : "outcome";
    return `${offset} ${unitLabel} ${direction} ${when}`;
}

export const FOLLOW_UP_DUE_ANCHOR_OPTIONS: Array<{ value: StageFollowUpDueAnchor; label: string }> = [
    { value: "outcome_recorded_at", label: "Outcome recorded" },
    { value: "scheduled_event_start", label: "Scheduled tour" },
    { value: "stage_entered_at", label: "Stage entered" },
    { value: "field_value", label: "Date field" },
];
