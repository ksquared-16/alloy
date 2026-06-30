/**
 * Typed value controls for Work View `filters_v1` — field/operator-aware options.
 * Date relative tokens: `next:7:days`, `prev:2:weeks`, `next:1:months`
 * Legacy presets: today, tomorrow, this_week, next_week, next_7_days, next_14_days
 */

import type { WorkViewFilterOperatorV1, WorkViewFilterV1 } from "@/lib/lifecycle/workViewsConfigV1";
import {
    getWorkViewConditionField,
    type WorkViewConditionValueKind,
} from "@/lib/lifecycle/workViewConditionFieldRegistry";

export type WorkViewFilterValueControlKind =
    | "date_preset"
    | "status_select"
    | "stage_select"
    | "location_select"
    | "program_select"
    | "boolean"
    | "text"
    | "none";

/** Select-style controls render an option dropdown sourced per-field by the editor. */
export const WORK_VIEW_SELECT_CONTROL_KINDS: ReadonlySet<WorkViewFilterValueControlKind> = new Set([
    "status_select",
    "stage_select",
    "location_select",
    "program_select",
]);

export type WorkViewFilterOption = { value: string; label: string };

export type WorkViewDateRelativeUnit = "days" | "weeks" | "months";
export type WorkViewDateRelativeDirection = "next" | "prev";

export const WORK_VIEW_DATE_FIXED_PRESET_OPTIONS: readonly WorkViewFilterOption[] = [
    { value: "today", label: "Today" },
    { value: "tomorrow", label: "Tomorrow" },
    { value: "this_week", label: "This week" },
    { value: "next_week", label: "Next week" },
] as const;

export const WORK_VIEW_DATE_RELATIVE_DIRECTION_OPTIONS: readonly WorkViewFilterOption[] = [
    { value: "next", label: "Next" },
    { value: "prev", label: "Previous" },
] as const;

export const WORK_VIEW_DATE_RELATIVE_UNIT_OPTIONS: readonly WorkViewFilterOption[] = [
    { value: "days", label: "days" },
    { value: "weeks", label: "weeks" },
    { value: "months", label: "months" },
] as const;

/** UI select options including relative + custom entry points. */
export const WORK_VIEW_DATE_PRESET_OPTIONS: readonly WorkViewFilterOption[] = [
    ...WORK_VIEW_DATE_FIXED_PRESET_OPTIONS,
    { value: "__relative__", label: "Relative range…" },
    { value: "__custom__", label: "Custom date" },
] as const;

export const WORK_VIEW_BOOLEAN_OPTIONS: readonly WorkViewFilterOption[] = [
    { value: "true", label: "True" },
    { value: "false", label: "False" },
] as const;

export const WORK_VIEW_LOCATION_STATIC_OPTIONS: readonly WorkViewFilterOption[] = [
    { value: "current_site", label: "Current site" },
] as const;

const LEGACY_PRESETS = new Set(["today", "tomorrow", "this_week", "next_week", "next_7_days", "next_14_days"]);

const VALUELESS_OPERATORS = new Set<WorkViewFilterOperatorV1>(["is_empty", "is_not_empty"]);

/** Registry-backed value-kind for a (possibly legacy) field key; null for unknown keys. */
function valueKindForField(fieldKey: string): WorkViewConditionValueKind | null {
    return getWorkViewConditionField(fieldKey)?.valueKind ?? null;
}

function isDateField(fieldKey: string): boolean {
    return valueKindForField(fieldKey) === "date_preset";
}

const RELATIVE_TOKEN_RE = /^(next|prev):(\d+):(days|weeks|months)$/;

export function parseRelativeDateToken(
    raw: string,
): { direction: WorkViewDateRelativeDirection; amount: number; unit: WorkViewDateRelativeUnit } | null {
    const match = raw.trim().match(RELATIVE_TOKEN_RE);
    if (!match) return null;
    const amount = Number(match[2]);
    if (!Number.isFinite(amount) || amount < 1) return null;
    return {
        direction: match[1] as WorkViewDateRelativeDirection,
        amount: Math.floor(amount),
        unit: match[3] as WorkViewDateRelativeUnit,
    };
}

export function serializeRelativeDateToken(
    direction: WorkViewDateRelativeDirection,
    amount: number,
    unit: WorkViewDateRelativeUnit,
): string {
    const n = Math.max(1, Math.floor(amount));
    return `${direction}:${n}:${unit}`;
}

export function formatRelativeDateTokenLabel(raw: string): string | null {
    const parsed = parseRelativeDateToken(raw);
    if (!parsed) return null;
    const dir = parsed.direction === "next" ? "Next" : "Previous";
    const unit = parsed.amount === 1 ? parsed.unit.replace(/s$/, "") : parsed.unit;
    return `${dir} ${parsed.amount} ${unit}`;
}

export function isRelativeDateFilterValue(value: unknown): boolean {
    return parseRelativeDateToken(String(value ?? "")) != null;
}

export function isLegacyDatePreset(value: unknown): boolean {
    return LEGACY_PRESETS.has(String(value ?? "").trim());
}

export function operatorsForWorkViewFilterField(fieldKey: string): WorkViewFilterOperatorV1[] {
    const def = getWorkViewConditionField(fieldKey);
    if (def) return [...def.operators];
    // Unknown / legacy-unmapped key — generic select operators.
    return ["equals", "not_equals", "is_any_of", "is_empty", "is_not_empty"];
}

export function operatorLabelsForField(fieldKey: string): ReadonlyArray<{ value: WorkViewFilterOperatorV1; label: string }> {
    const labels: Record<WorkViewFilterOperatorV1, string> = {
        equals: "equals",
        not_equals: "does not equal",
        is_any_of: "is any of",
        is_empty: "is empty",
        is_not_empty: "is not empty",
        date_is: "date is",
        date_between: "date between",
    };
    return operatorsForWorkViewFilterField(fieldKey).map((value) => ({ value, label: labels[value] }));
}

export function resolveWorkViewFilterValueControlKind(
    fieldKey: string,
    operator: WorkViewFilterOperatorV1,
): WorkViewFilterValueControlKind {
    if (VALUELESS_OPERATORS.has(operator)) return "none";
    const valueKind = valueKindForField(fieldKey);
    if (!valueKind || valueKind === "none") return "text";
    // Registry value-kinds map 1:1 to control kinds (none handled above).
    return valueKind;
}

export function defaultFilterValueForField(fieldKey: string, operator: WorkViewFilterOperatorV1): unknown {
    if (VALUELESS_OPERATORS.has(operator)) return null;
    const kind = resolveWorkViewFilterValueControlKind(fieldKey, operator);
    switch (kind) {
        case "date_preset":
            return "today";
        case "boolean":
            return "true";
        case "location_select":
            return "current_site";
        case "status_select":
        case "stage_select":
        case "program_select":
            return "";
        default:
            return "";
    }
}

export function coerceWorkViewFilterValue(
    fieldKey: string,
    operator: WorkViewFilterOperatorV1,
    raw: unknown,
): unknown {
    if (VALUELESS_OPERATORS.has(operator)) return null;
    const kind = resolveWorkViewFilterValueControlKind(fieldKey, operator);
    const str = String(raw ?? "").trim();
    if (kind === "date_preset") {
        if (!str) return "today";
        if (WORK_VIEW_DATE_FIXED_PRESET_OPTIONS.some((o) => o.value === str)) return str;
        if (isLegacyDatePreset(str) || parseRelativeDateToken(str)) return str;
        if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str;
        return "today";
    }
    if (kind === "boolean") {
        return str === "false" ? "false" : "true";
    }
    if (kind === "location_select") {
        return str || "current_site";
    }
    return raw ?? "";
}

export function patchWorkViewFilterRow(
    row: WorkViewFilterV1,
    patch: Partial<WorkViewFilterV1>,
): WorkViewFilterV1 {
    const next: WorkViewFilterV1 = { ...row, ...patch };
    const fieldKey = next.field_key.trim();
    const allowedOps = operatorsForWorkViewFilterField(fieldKey);
    if (!allowedOps.includes(next.operator)) {
        next.operator = allowedOps[0] ?? "equals";
    }
    // When the field changes (and the caller did not supply an explicit value), reset to the new
    // field's typed default so stale option values from the previous field cannot leak through.
    const fieldChanged = patch.field_key != null && patch.field_key.trim() !== row.field_key.trim();
    next.value =
        fieldChanged && patch.value === undefined ?
            defaultFilterValueForField(fieldKey, next.operator)
        :   coerceWorkViewFilterValue(fieldKey, next.operator, next.value);
    return next;
}

export function createDefaultWorkViewFilterRow(fieldKey = "tour_date"): WorkViewFilterV1 {
    return patchWorkViewFilterRow(
        { field_key: fieldKey, operator: "equals", value: "" },
        { field_key: fieldKey },
    );
}

export function isCustomDateFilterValue(value: unknown): boolean {
    const str = String(value ?? "").trim();
    if (!str || str === "__custom__" || str === "__relative__") return false;
    if (WORK_VIEW_DATE_FIXED_PRESET_OPTIONS.some((o) => o.value === str)) return false;
    if (isLegacyDatePreset(str) || parseRelativeDateToken(str)) return false;
    return /^\d{4}-\d{2}-\d{2}/.test(str);
}

export function datePresetSelectValue(value: unknown): string {
    const str = String(value ?? "").trim();
    if (!str) return "today";
    if (WORK_VIEW_DATE_FIXED_PRESET_OPTIONS.some((o) => o.value === str)) return str;
    if (isLegacyDatePreset(str) || parseRelativeDateToken(str)) return "__relative__";
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return "__custom__";
    return "today";
}

export function readRelativeDateControlState(value: unknown): {
    direction: WorkViewDateRelativeDirection;
    amount: number;
    unit: WorkViewDateRelativeUnit;
} {
    const parsed = parseRelativeDateToken(String(value ?? ""));
    if (parsed) return parsed;
    if (String(value) === "next_7_days") return { direction: "next", amount: 7, unit: "days" };
    if (String(value) === "next_14_days") return { direction: "next", amount: 14, unit: "days" };
    return { direction: "next", amount: 7, unit: "days" };
}

export function formatWorkViewFilterValueLabel(
    fieldKey: string,
    operator: WorkViewFilterOperatorV1,
    value: unknown,
    options?: {
        statusOptions?: readonly WorkViewFilterOption[];
        locationOptions?: readonly WorkViewFilterOption[];
        stageOptions?: readonly WorkViewFilterOption[];
        programOptions?: readonly WorkViewFilterOption[];
    },
): string {
    if (VALUELESS_OPERATORS.has(operator)) return "";
    const kind = resolveWorkViewFilterValueControlKind(fieldKey, operator);
    const str = String(value ?? "").trim();
    if (!str) return "—";

    if (kind === "date_preset") {
        const fixed = WORK_VIEW_DATE_FIXED_PRESET_OPTIONS.find((o) => o.value === str);
        if (fixed) return fixed.label;
        const relative = formatRelativeDateTokenLabel(str);
        if (relative) return relative;
        if (str === "next_7_days") return "Next 7 days";
        if (str === "next_14_days") return "Next 14 days";
        if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
            try {
                return new Date(str).toLocaleDateString(undefined, { dateStyle: "medium" });
            } catch {
                return str;
            }
        }
        return str;
    }
    if (kind === "boolean") {
        return str === "true" ? "True" : "False";
    }
    if (kind === "status_select") {
        const match = options?.statusOptions?.find((o) => o.value === str);
        return match?.label ?? str;
    }
    if (kind === "stage_select") {
        const match = options?.stageOptions?.find((o) => o.value === str);
        return match?.label ?? str;
    }
    if (kind === "program_select") {
        const match = options?.programOptions?.find((o) => o.value === str);
        return match?.label ?? str;
    }
    if (kind === "location_select") {
        if (str === "current_site") return "Current site";
        const match = options?.locationOptions?.find((o) => o.value === str);
        return match?.label ?? str;
    }
    return str;
}

export function mergeLocationFilterOptions(
    locations: readonly WorkViewFilterOption[],
): WorkViewFilterOption[] {
    return [
        ...WORK_VIEW_LOCATION_STATIC_OPTIONS,
        ...locations.filter((loc) => loc.value !== "current_site"),
    ];
}
