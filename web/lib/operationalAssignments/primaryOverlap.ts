/**
 * Effective-dated primary uniqueness helpers.
 *
 * Exactly zero or one primary assignment may cover any calendar day for a
 * subject. Historical ended and non-overlapping future primaries may coexist.
 */

import { assertValidIsoDate, compareIsoDates } from "@/lib/childcareOperational/effectiveDating";

export type DatedWindow = {
    start_date: string;
    end_date: string | null;
};

/** Closed date ranges overlap when both ends are inclusive (null end = open). */
export function assignmentDateRangesOverlap(a: DatedWindow, b: DatedWindow): boolean {
    assertValidIsoDate(a.start_date, "a.start_date");
    assertValidIsoDate(b.start_date, "b.start_date");
    if (a.end_date) assertValidIsoDate(a.end_date, "a.end_date");
    if (b.end_date) assertValidIsoDate(b.end_date, "b.end_date");

    const aEndsAfterBStarts =
        a.end_date == null || compareIsoDates(a.end_date, b.start_date) >= 0;
    const bEndsAfterAStarts =
        b.end_date == null || compareIsoDates(b.end_date, a.start_date) >= 0;
    return aEndsAfterBStarts && bEndsAfterAStarts;
}

/** True when the window covers `asOf` (inclusive). */
export function windowCoversDate(window: DatedWindow, asOf: string): boolean {
    assertValidIsoDate(asOf, "asOf");
    if (compareIsoDates(window.start_date, asOf) > 0) return false;
    if (window.end_date != null && compareIsoDates(window.end_date, asOf) < 0) return false;
    return true;
}
