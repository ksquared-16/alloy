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
const SUPPORTED_FIELD_KEYS = new Set<string>(
    WORK_VIEW_CONDITION_FIELD_DEFS.filter((def) => def.runtimeSupported).map((def) => def.runtimeField),
);

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

/** Resolve a row value for a canonical runtime field key (legacy keys are canonicalized by callers). */
function fieldValue(row: Record<string, unknown>, fieldKey: string): string | null {
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

const DATE_FIELD_KEYS = new Set(["tour_date", "updated_at"]);

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

function parseRelativeDateTokenForEvaluation(
    raw: string,
): ((actualDate: Date, now: Date) => boolean) | null {
    const match = raw.trim().match(/^(next|prev):(\d+):(days|weeks|months)$/);
    if (!match) return null;
    const direction = match[1];
    const amount = Math.max(1, Number(match[2]));
    const unit = match[3];
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
): WorkViewFilterEvaluationResult {
    // Canonicalize legacy keys (`stage`/`status`/`location`) so runtime resolves them identically to
    // the typed keys, even if a saved view has not yet been re-persisted with canonical keys.
    const fieldKey = canonicalWorkViewConditionFieldKey(filter.field_key.trim());
    if (!SUPPORTED_FIELD_KEYS.has(fieldKey)) {
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

    const actual = fieldValue(row, fieldKey);
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

/** All filters must pass (AND). Empty filter list passes all rows. */
export function evaluateWorkViewFiltersForRow(
    row: Record<string, unknown>,
    filters: readonly WorkViewFilterV1[] | null | undefined,
): WorkViewFilterEvaluationResult {
    if (!filters?.length) return { pass: true, notes: [] };
    const notes: WorkViewFilterEvaluationNote[] = [];
    for (const filter of filters) {
        const result = evaluateOneFilter(row, filter);
        notes.push(...result.notes);
        if (!result.pass) return { pass: false, notes };
    }
    return { pass: true, notes };
}

export function filterQueueRowsByWorkViewFilters<T extends Record<string, unknown>>(
    rows: readonly T[],
    filters: readonly WorkViewFilterV1[] | null | undefined,
): T[] {
    if (!filters?.length) return [...rows];
    return rows.filter((row) => evaluateWorkViewFiltersForRow(row, filters).pass);
}
