/**
 * Operator-facing date display for layout runtime (drawer + summary cards).
 *
 * Date only: MM-DD-YYYY
 * Date + time: MM-DD-YYYY h:mm A
 */

import { formatQueueRecordDateDisplay } from "@/lib/adminFormatters";
import { isQueueRecordDateFieldKey } from "@/lib/layout/runtime/queueRecordScopedResolve";

/** Format a user-facing date/time value for layout runtime surfaces. */
export function formatLayoutRuntimeOperatorDate(value: string | number | Date | null | undefined): string {
    const formatted = formatQueueRecordDateDisplay(value);
    if (!formatted) return "";
    return formatted.replace(" · ", " ");
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
