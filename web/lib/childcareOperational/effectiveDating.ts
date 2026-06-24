/**
 * Effective-dating helpers for childcare operational enrollment (calendar dates, YYYY-MM-DD).
 */

import {
    deriveAgreementStatusFromStartDate,
    derivePlacementStatusFromStartDate,
    type ChildEnrollmentAgreementStatus,
} from "@/lib/childcareOperational/enrollmentOperationalStatus";

export const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type IsoDateValidationError = {
    code: "invalid_iso_date" | "end_before_start";
    message: string;
};

export function isValidIsoDateString(value: string): boolean {
    const m = ISO_DATE_RE.exec(value.trim());
    if (!m) return false;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return (
        dt.getUTCFullYear() === y &&
        dt.getUTCMonth() === mo - 1 &&
        dt.getUTCDate() === d
    );
}

export function assertValidIsoDate(value: string, fieldName = "date"): void {
    if (!isValidIsoDateString(value)) {
        throw new RangeError(`${fieldName} must be a valid YYYY-MM-DD date: ${value}`);
    }
}

export function compareIsoDates(a: string, b: string): number {
    assertValidIsoDate(a, "a");
    assertValidIsoDate(b, "b");
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
}

export function validateEndOnOrAfterStart(
    startDate: string | null | undefined,
    endDate: string | null | undefined
): IsoDateValidationError | null {
    if (!startDate?.trim() || !endDate?.trim()) return null;
    if (!isValidIsoDateString(startDate) || !isValidIsoDateString(endDate)) {
        return {
            code: "invalid_iso_date",
            message: "start_date and end_date must be valid YYYY-MM-DD values",
        };
    }
    if (compareIsoDates(endDate, startDate) < 0) {
        return {
            code: "end_before_start",
            message: "end_date must be on or after start_date",
        };
    }
    return null;
}

/** Calendar day immediately before newStartDate (for closing prior operational row). */
export function computePriorRowCloseDate(newStartDate: string): string {
    assertValidIsoDate(newStartDate, "newStartDate");
    const m = ISO_DATE_RE.exec(newStartDate.trim())!;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const dt = new Date(Date.UTC(y, mo - 1, d));
    dt.setUTCDate(dt.getUTCDate() - 1);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
}

export function isStartDateAfterToday(startDate: string, todayYmd: string): boolean {
    assertValidIsoDate(startDate, "startDate");
    assertValidIsoDate(todayYmd, "todayYmd");
    return compareIsoDates(startDate, todayYmd) > 0;
}

export function isStartDateOnOrBeforeToday(startDate: string, todayYmd: string): boolean {
    return !isStartDateAfterToday(startDate, todayYmd);
}

/**
 * Supersede invalid when new start is on or before prior start, or when new start
 * is before prior end (overlap) for a still-open prior row.
 */
export function isInvalidSupersedeStartDate(input: {
    priorStartDate: string;
    priorEndDate: string | null | undefined;
    newStartDate: string;
}): boolean {
    const { priorStartDate, priorEndDate, newStartDate } = input;
    assertValidIsoDate(priorStartDate, "priorStartDate");
    assertValidIsoDate(newStartDate, "newStartDate");

    if (compareIsoDates(newStartDate, priorStartDate) <= 0) {
        return true;
    }

    if (priorEndDate?.trim()) {
        assertValidIsoDate(priorEndDate, "priorEndDate");
        if (compareIsoDates(newStartDate, priorEndDate) <= 0) {
            return true;
        }
    }

    return false;
}

export function shouldTransitionAgreementEndingToEnded(
    status: string,
    endDate: string | null | undefined,
    todayYmd: string
): boolean {
    if (status !== "ending") return false;
    if (!endDate?.trim()) return false;
    if (!isValidIsoDateString(endDate) || !isValidIsoDateString(todayYmd)) return false;
    return compareIsoDates(endDate, todayYmd) < 0;
}

export function shouldTransitionPlacementEndingToEnded(
    status: string,
    endDate: string | null | undefined,
    todayYmd: string
): boolean {
    return shouldTransitionAgreementEndingToEnded(status, endDate, todayYmd);
}

export function resolveAgreementStatusAfterStartDateChange(
    startDate: string | null | undefined,
    todayYmd: string,
    currentStatus: ChildEnrollmentAgreementStatus
): ChildEnrollmentAgreementStatus {
    if (currentStatus === "ending" || currentStatus === "ended" || currentStatus === "canceled") {
        return currentStatus;
    }
    return deriveAgreementStatusFromStartDate(startDate, todayYmd);
}

export function resolvePlacementStatusForStartDate(startDate: string, todayYmd: string): "planned" | "active" {
    return derivePlacementStatusFromStartDate(startDate, todayYmd);
}
