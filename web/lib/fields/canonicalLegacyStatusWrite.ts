/**
 * Legacy text status columns (opportunities.status, persons.status, customers.status)
 * are deprecated. New writes must use status_key + status_definitions.
 */

export const LEGACY_TEXT_STATUS_COLUMNS = {
    opportunities: "status",
    persons: "status",
    customers: "status",
} as const;

export type LegacyTextStatusTable = keyof typeof LEGACY_TEXT_STATUS_COLUMNS;

/** Reject PATCH bodies that attempt to write legacy text status columns. */
export function rejectLegacyTextStatusPatch(body: Record<string, unknown>): string | null {
    if (Object.prototype.hasOwnProperty.call(body, "status") && body.status !== undefined) {
        return "Legacy status text column is deprecated; use status_key instead";
    }
    return null;
}

/** Remove legacy text status from insert/update payloads (prefer status_key). */
export function stripLegacyTextStatusFromWritePayload(payload: Record<string, unknown>): void {
    delete payload.status;
}
