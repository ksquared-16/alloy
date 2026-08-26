/**
 * The organisation-local calendar date a document was executed.
 *
 * A date printed beside a signature is a fact about the signing, so it is resolved from the instant
 * the family submitted — in the organisation's own timezone, because a 9pm Pacific signature is not
 * tomorrow. The canonical value stays an ISO date-only string; how a given artifact prints it is a
 * presentation decision kept separate from it.
 *
 * Pure. No I/O — the caller supplies the instant and the zone from their canonical owners.
 */

import { formatInTimeZone } from "date-fns-tz";
import type { DerivedFieldResult } from "@/lib/fields/derived/types";

export type ExecutionDateFormat = "iso" | "us_slash" | "long";

export function formatExecutionDate(isoDateOnly: string, format: ExecutionDateFormat = "us_slash"): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDateOnly.trim());
    if (!m) return isoDateOnly;
    const [, y, mo, d] = m;
    switch (format) {
        case "iso":
            return `${y}-${mo}-${d}`;
        case "long": {
            const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            return `${months[Number(mo) - 1]} ${Number(d)}, ${y}`;
        }
        case "us_slash":
        default:
            return `${Number(mo)}/${Number(d)}/${y}`;
    }
}

export function deriveExecutionDate(
    executedAtIso: string,
    timeZone: string,
    format: ExecutionDateFormat = "us_slash",
): DerivedFieldResult | null {
    const dt = new Date(executedAtIso);
    if (Number.isNaN(dt.getTime())) return null;
    let dateOnly: string;
    try {
        dateOnly = formatInTimeZone(dt, timeZone, "yyyy-MM-dd");
    } catch {
        return null;
    }
    return {
        kind: "execution_date",
        value: null,
        display: formatExecutionDate(dateOnly, format),
        // The stored canonical date, kept distinct from how this artifact prints it.
        source_value: dateOnly,
    };
}
