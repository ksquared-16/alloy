/**
 * Evaluate process-level Work View `filters_v1` against queue row payloads.
 * Fail-safe: unsupported fields/operators pass rows through.
 */

import { buildQueueRowLayoutRuntimeEnrichment } from "@/lib/layout/runtime/queueRowLayoutRuntimeEnrichment";
import type { WorkViewFilterOperatorV1, WorkViewFilterV1 } from "@/lib/lifecycle/workViewsConfigV1";
import {
    canonicalWorkViewConditionFieldKey,
    WORK_VIEW_CONDITION_FIELD_DEFS,
} from "@/lib/lifecycle/workViewConditionFieldRegistry";
import type { TenantFieldDefinitionRow } from "@/lib/layout/tenantLayoutFieldPickerCatalog";
import { isCanonicalWorkViewConditionFieldKey } from "@/lib/lifecycle/workViewCanonicalOperands";
import { resolveItemValue } from "@/lib/layout/resolveItemValue";
import { parseRelativeDateToken } from "@/lib/lifecycle/workViewFilterValueControls";

export type WorkViewFilterEvaluationNote = {
    field_key: string;
    operator: WorkViewFilterOperatorV1;
    supported: boolean;
    reason?: string;
};

export type WorkViewFilterEvaluationResult = {
    pass: boolean;
    notes: WorkViewFilterEvaluationNote[];
};

/** Canonical runtime keys the evaluator can apply (legacy keys canonicalize into these). */
const OPERATIONAL_SUPPORTED_FIELD_KEYS = new Set<string>(
    WORK_VIEW_CONDITION_FIELD_DEFS.filter((def) => def.runtimeSupported).map((def) => def.runtimeField),
);

function isSupportedWorkViewFieldKey(
    fieldKey: string,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): boolean {
    if (OPERATIONAL_SUPPORTED_FIELD_KEYS.has(fieldKey)) return true;
    return isCanonicalWorkViewConditionFieldKey(fieldKey, tenantFieldDefinitions);
}

function norm(value: unknown): string {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}

function readRowString(row: Record<string, unknown>, key: string): string | null {
    const v = row[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

function canonicalRefKeyRowValue(row: Record<string, unknown>, refKey: string): string | null {
    if (row[refKey] != null) {
        const direct = readRowString(row, refKey);
        if (direct) return direct;
    }
    const resolved = resolveItemValue(row, { id: refKey, kind: "field", refKey });
    if (resolved.raw != null && String(resolved.raw).trim()) return String(resolved.raw).trim();
    if (resolved.display && resolved.display !== "—") return resolved.display.trim();

    const fieldKey = refKey.includes(".") ? refKey.slice(refKey.indexOf(".") + 1) : refKey;
    const directField = readRowString(row, fieldKey);
    if (directField) return directField;

    const md = row.metadata;
    if (md && typeof md === "object" && !Array.isArray(md)) {
        const fieldValues = (md as Record<string, unknown>).field_values;
        if (fieldValues && typeof fieldValues === "object" && !Array.isArray(fieldValues)) {
            const value = (fieldValues as Record<string, unknown>)[fieldKey];
            if (typeof value === "string" && value.trim()) return value.trim();
            if (value != null && typeof value !== "object") return String(value);
        }
    }
    return null;
}

/** Resolve a row value for a canonical runtime field key (legacy keys are canonicalized by callers). */
function fieldValue(
    row: Record<string, unknown>,
    fieldKey: string,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): string | null {
    const enrichment = buildQueueRowLayoutRuntimeEnrichment(row);
    switch (fieldKey) {
        case "opportunity_status":
            return enrichment.statusKey ?? enrichment.statusDisplay ?? readRowString(row, "status_key");
        case "opportunity_stage":
            return readRowString(row, "lifecycle_stage_key") ?? readRowString(row, "_lifecycle_stage_key");
        case "child_enrollment_status":
            return (
                readRowString(row, "child_enrollment_status_key") ??
                readRowString(row, "candidate_status_key") ??
                readRowString(row, "child_status_key") ??
                readRowString(row, "ocm_status_key") ??
                readRowString(row, "_child_status_key")
            );
        case "site":
            return enrichment.locationLabel ?? readRowString(row, "site_id") ?? readRowString(row, "location_id");
        case "program":
            return (
                enrichment.programLabel ??
                readRowString(row, "program") ??
                readRowString(row, "_requested_program") ??
                readRowString(row, "program_id")
            );
        case "room":
            return (
                readRowString(row, "room_id") ??
                readRowString(row, "room_key") ??
                readRowString(row, "site_room") ??
                readRowString(row, "room") ??
                readRowString(row, "_room")
            );
        case "start_date": {
            const direct =
                readRowString(row, "start_date") ??
                readRowString(row, "requested_start_date") ??
                readRowString(row, "desired_start");
            if (direct) return direct;
            const md = row.metadata;
            if (md && typeof md === "object" && !Array.isArray(md)) {
                const v = (md as Record<string, unknown>).start_date ?? (md as Record<string, unknown>).desired_start;
                if (typeof v === "string" && v.trim()) return v.trim();
            }
            return null;
        }
        case "current_work": {
            if (row._has_open_work === true || row.has_open_work === true) return "true";
            const count =
                (typeof row.open_work_count === "number" ? row.open_work_count : null) ??
                (typeof row._open_work_count === "number" ? row._open_work_count : null);
            if (typeof count === "number") return count > 0 ? "true" : "false";
            return "false";
        }
        case "needs_attention":
            if (row._needs_attention === true || row.needs_attention === true) return "true";
            if (enrichment.attentionReason) return "true";
            return "false";
        case "tour_date": {
            const md = row.metadata;
            if (md && typeof md === "object" && !Array.isArray(md)) {
                const tour = (md as Record<string, unknown>).tour_date;
                if (typeof tour === "string" && tour.trim()) return tour.trim();
            }
            return enrichment.tourDisplay ?? null;
        }
        case "updated_at":
            return readRowString(row, "updated_at");
        case "needs_follow_up":
            if (row._needs_follow_up === true || row.needs_follow_up === true) return "true";
            if (enrichment.attentionReason) return "true";
            return "false";
        default:
            if (isCanonicalWorkViewConditionFieldKey(fieldKey, tenantFieldDefinitions)) {
                return canonicalRefKeyRowValue(row, fieldKey);
            }
            return null;
    }
}

function parseFilterValues(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map((v) => String(v ?? "").trim()).filter(Boolean);
    }
    const raw = String(value ?? "").trim();
    if (!raw) return [];
    if (raw.includes(",")) {
        return raw.split(",").map((part) => part.trim()).filter(Boolean);
    }
    return [raw];
}

function parseIsoDate(value: string | null | undefined): Date | null {
    const raw = value?.trim();
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
}

function startOfUtcDay(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function endOfUtcDay(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

function addUtcDays(d: Date, days: number): Date {
    const next = new Date(d);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}

/** Monday-start week boundaries in UTC. */
function utcWeekRange(reference: Date, offsetWeeks: number): { start: Date; end: Date } {
    const day = reference.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const start = startOfUtcDay(addUtcDays(reference, mondayOffset + offsetWeeks * 7));
    const end = endOfUtcDay(addUtcDays(start, 6));
    return { start, end };
}

const DATE_FIELD_KEYS = new Set(["tour_date", "updated_at", "start_date"]);

function isDateFieldKey(fieldKey: string): boolean {
    return DATE_FIELD_KEYS.has(fieldKey);
}

function evaluateDatePreset(actualDate: Date | null, presetRaw: string): boolean | null {
    if (!actualDate) return false;
    const preset = presetRaw.trim().toLowerCase();
    const now = new Date();
    switch (preset) {
        case "today":
            return sameUtcDay(actualDate, now);
        case "tomorrow":
            return sameUtcDay(actualDate, addUtcDays(now, 1));
        case "next_7_days": {
            const start = startOfUtcDay(now);
            const end = endOfUtcDay(addUtcDays(now, 7));
            return actualDate >= start && actualDate <= end;
        }
        case "next_14_days": {
            const start = startOfUtcDay(now);
            const end = endOfUtcDay(addUtcDays(now, 14));
            return actualDate >= start && actualDate <= end;
        }
        case "this_week": {
            const { start, end } = utcWeekRange(now, 0);
            return actualDate >= start && actualDate <= end;
        }
        case "next_week": {
            const { start, end } = utcWeekRange(now, 1);
            return actualDate >= start && actualDate <= end;
        }
        default: {
            const relative = parseRelativeDateTokenForEvaluation(preset);
            if (relative) return relative(actualDate, now);
            return null;
        }
    }
}

function addUtcMonths(d: Date, months: number): Date {
    const next = new Date(d);
    next.setUTCMonth(next.getUTCMonth() + months);
    return next;
}

/**
 * A relative date token (`prev:14:days`, `next:1:months`) as a span test.
 *
 * The token GRAMMAR is not restated here. It used to be: an independently written copy of the same
 * regex lived in this file while the builder's copy lived in `workViewFilterValueControls`, with
 * nothing tying them together. Two hand-written parsers for one saved format is a drift waiting to
 * happen — widen one and conditions authored in the builder quietly stop matching, or match something
 * else. The builder owns what a token IS; this owns what it MEANS against a date.
 */
function parseRelativeDateTokenForEvaluation(
    raw: string,
): ((actualDate: Date, now: Date) => boolean) | null {
    const parsed = parseRelativeDateToken(raw);
    if (!parsed) return null;
    const direction = parsed.direction;
    const amount = Math.max(1, parsed.amount);
    const unit = parsed.unit;
    return (actualDate, now) => {
        const todayStart = startOfUtcDay(now);
        const todayEnd = endOfUtcDay(now);
        let spanStart = todayStart;
        let spanEnd = todayEnd;
        if (unit === "days") {
            if (direction === "next") spanEnd = endOfUtcDay(addUtcDays(now, amount));
            else spanStart = startOfUtcDay(addUtcDays(now, -amount));
        } else if (unit === "weeks") {
            const days = amount * 7;
            if (direction === "next") spanEnd = endOfUtcDay(addUtcDays(now, days));
            else spanStart = startOfUtcDay(addUtcDays(now, -days));
        } else {
            const edge = addUtcMonths(now, direction === "next" ? amount : -amount);
            if (direction === "next") spanEnd = endOfUtcDay(edge);
            else spanStart = startOfUtcDay(edge);
        }
        return actualDate >= spanStart && actualDate <= spanEnd;
    };
}

function evaluateDateComparison(
    actual: string | null,
    expectedParts: string[],
    operator: WorkViewFilterOperatorV1,
): boolean {
    const actualDate = parseIsoDate(actual);
    for (const part of expectedParts) {
        const presetResult = evaluateDatePreset(actualDate, part);
        if (presetResult != null) {
            if (operator === "not_equals") return !presetResult;
            return presetResult;
        }
        const expectedDate = parseIsoDate(part);
        if (!actualDate || !expectedDate) continue;
        const match = sameUtcDay(actualDate, expectedDate);
        if (operator === "not_equals") return !match;
        return match;
    }
    return operator === "not_equals";
}

function sameUtcDay(a: Date, b: Date): boolean {
    return (
        a.getUTCFullYear() === b.getUTCFullYear()
        && a.getUTCMonth() === b.getUTCMonth()
        && a.getUTCDate() === b.getUTCDate()
    );
}

function evaluateOneFilter(
    row: Record<string, unknown>,
    filter: WorkViewFilterV1,
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): WorkViewFilterEvaluationResult {
    // Canonicalize legacy keys (`stage`/`status`/`location`) so runtime resolves them identically to
    // the typed keys, even if a saved view has not yet been re-persisted with canonical keys.
    const fieldKey = canonicalWorkViewConditionFieldKey(filter.field_key.trim());
    if (!isSupportedWorkViewFieldKey(fieldKey, tenantFieldDefinitions)) {
        return {
            pass: true,
            notes: [{ field_key: fieldKey, operator: filter.operator, supported: false, reason: "unsupported_field" }],
        };
    }

    if (filter.operator === "date_between") {
        return {
            pass: true,
            notes: [{ field_key: fieldKey, operator: filter.operator, supported: false, reason: "unsupported_operator" }],
        };
    }

    const actual = fieldValue(row, fieldKey, tenantFieldDefinitions);
    const expectedParts = parseFilterValues(filter.value);

    if (isDateFieldKey(fieldKey) && (filter.operator === "equals" || filter.operator === "not_equals" || filter.operator === "date_is")) {
        return {
            pass: evaluateDateComparison(actual, expectedParts, filter.operator),
            notes: [{ field_key: fieldKey, operator: filter.operator, supported: true }],
        };
    }

    if (fieldKey === "site" && filter.operator === "equals" && expectedParts.some((p) => norm(p) === "current_site")) {
        return {
            pass: true,
            notes: [{
                field_key: fieldKey,
                operator: filter.operator,
                supported: false,
                reason: "current_site_requires_runtime_context",
            }],
        };
    }

    switch (filter.operator) {
        case "is_empty":
            return { pass: !actual, notes: [{ field_key: fieldKey, operator: filter.operator, supported: true }] };
        case "is_not_empty":
            return { pass: Boolean(actual), notes: [{ field_key: fieldKey, operator: filter.operator, supported: true }] };
        case "equals":
            return {
                pass: expectedParts.some((part) => norm(actual) === norm(part) || norm(actual).includes(norm(part))),
                notes: [{ field_key: fieldKey, operator: filter.operator, supported: true }],
            };
        case "not_equals":
            return {
                pass: !expectedParts.some((part) => norm(actual) === norm(part) || norm(actual).includes(norm(part))),
                notes: [{ field_key: fieldKey, operator: filter.operator, supported: true }],
            };
        case "is_any_of":
            return {
                pass: expectedParts.some((part) => norm(actual) === norm(part) || norm(actual).includes(norm(part))),
                notes: [{ field_key: fieldKey, operator: filter.operator, supported: true }],
            };
        case "date_is": {
            const actualDate = parseIsoDate(actual);
            const presetResult = evaluateDatePreset(actualDate, expectedParts[0] ?? "");
            if (presetResult != null) {
                return {
                    pass: presetResult,
                    notes: [{ field_key: fieldKey, operator: filter.operator, supported: true }],
                };
            }
            const expectedDate = parseIsoDate(expectedParts[0] ?? null);
            if (!actualDate || !expectedDate) {
                return { pass: true, notes: [{ field_key: fieldKey, operator: filter.operator, supported: false, reason: "invalid_date" }] };
            }
            return {
                pass: sameUtcDay(actualDate, expectedDate),
                notes: [{ field_key: fieldKey, operator: filter.operator, supported: true }],
            };
        }
        default:
            return {
                pass: true,
                notes: [{ field_key: fieldKey, operator: filter.operator, supported: false, reason: "unsupported_operator" }],
            };
    }
}

/** How conditions combine: `all` = every condition (AND), `any` = at least one (OR). */
export type WorkViewFilterMatch = "all" | "any";

/**
 * Evaluate a row against a Work View's conditions.
 * - `match = "all"` (default): every condition must pass (AND). Short-circuits on the first failure.
 * - `match = "any"`: at least one condition must pass (OR). Short-circuits on the first pass.
 *
 * Unsupported fields/operators are fail-safe: under AND they pass through (don't exclude the row);
 * under OR they are skipped (a `supported:false` note never satisfies an OR on its own). Empty filter
 * list passes all rows. Defaulting to AND preserves pre-V3 behavior for saved views with no `match`.
 */
export function evaluateWorkViewFiltersForRow(
    row: Record<string, unknown>,
    filters: readonly WorkViewFilterV1[] | null | undefined,
    match: WorkViewFilterMatch = "all",
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): WorkViewFilterEvaluationResult {
    if (!filters?.length) return { pass: true, notes: [] };
    const notes: WorkViewFilterEvaluationNote[] = [];

    if (match === "any") {
        let anySupported = false;
        for (const filter of filters) {
            const result = evaluateOneFilter(row, filter, tenantFieldDefinitions);
            notes.push(...result.notes);
            const supported = result.notes.every((n) => n.supported);
            if (supported) {
                anySupported = true;
                if (result.pass) return { pass: true, notes };
            }
        }
        // No supported condition matched. If nothing was evaluable, fail open (pass) like AND does.
        return { pass: !anySupported, notes };
    }

    for (const filter of filters) {
        const result = evaluateOneFilter(row, filter, tenantFieldDefinitions);
        notes.push(...result.notes);
        if (!result.pass) return { pass: false, notes };
    }
    return { pass: true, notes };
}

export function filterQueueRowsByWorkViewFilters<T extends Record<string, unknown>>(
    rows: readonly T[],
    filters: readonly WorkViewFilterV1[] | null | undefined,
    match: WorkViewFilterMatch = "all",
    tenantFieldDefinitions?: readonly TenantFieldDefinitionRow[],
): T[] {
    if (!filters?.length) return [...rows];
    return rows.filter((row) => evaluateWorkViewFiltersForRow(row, filters, match, tenantFieldDefinitions).pass);
}
