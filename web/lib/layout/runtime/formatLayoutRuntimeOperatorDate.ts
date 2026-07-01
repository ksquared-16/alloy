/**
 * Operator-facing date display for layout runtime (drawer + summary cards).
 *
 * Display doctrine: `Jan 13, 2024` · `Jan 13, 2024 · 2:30 PM`
 * Input fields may continue MM-DD-YYYY — see typography-and-presentation-doctrine.md
 */

import {
    formatDisplayDate,
    formatDisplayDateTime,
    parsePresentationDateInput,
} from "@/lib/presentation/presentationDateFormat";
import { isQueueRecordDateFieldKey } from "@/lib/layout/runtime/queueRecordScopedResolve";

/** Format a user-facing date/time value for layout runtime surfaces. */
export function formatLayoutRuntimeOperatorDate(value: string | number | Date | null | undefined): string {
    if (value === null || value === undefined || value === "") return "";
    const parsed = parsePresentationDateInput(value);
    if (!parsed) return String(value).trim();
    if (parsed.hasTime) return formatDisplayDateTime(parsed.date);
    return formatDisplayDate(parsed.date);
}

/** True when a layout refKey should receive operator date formatting. */
export function isLayoutRuntimeOperatorDateRefKey(refKey: string): boolean {
    return isQueueRecordDateFieldKey(refKey);
}

export function formatLayoutRuntimeOperatorDateIfRefKey(
    refKey: string,
    value: string,
    renderHint?: string,
): string {
    if (renderHint === "date" || isLayoutRuntimeOperatorDateRefKey(refKey)) {
        const formatted = formatLayoutRuntimeOperatorDate(value);
        return formatted || value;
    }
    return value;
}
