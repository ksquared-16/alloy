/**
 * Childcare operational enrollment — status vocabulary (slice 1 schema).
 * Keep aligned with supabase/migrations/20260625120000_childcare_operational_enrollment_slice1.sql
 */

export const CHILD_ENROLLMENT_AGREEMENT_STATUSES = [
    "pending_start",
    "active",
    "ending",
    "ended",
    "canceled",
] as const;

export type ChildEnrollmentAgreementStatus = (typeof CHILD_ENROLLMENT_AGREEMENT_STATUSES)[number];

/** Non-ended operational agreement — one per child × site (partial unique index). */
export const CHILD_ENROLLMENT_AGREEMENT_OPERATIONAL_STATUSES = [
    "pending_start",
    "active",
    "ending",
] as const satisfies readonly ChildEnrollmentAgreementStatus[];

export const CHILD_ENROLLMENT_AGREEMENT_TERMINAL_STATUSES = [
    "ended",
    "canceled",
] as const satisfies readonly ChildEnrollmentAgreementStatus[];

export const CHILD_PLACEMENT_STATUSES = [
    "planned",
    "active",
    "ending",
    "ended",
    "superseded",
    "canceled",
] as const;

export type ChildPlacementStatus = (typeof CHILD_PLACEMENT_STATUSES)[number];

export const CHILD_PLACEMENT_OPERATIONAL_STATUSES = [
    "planned",
    "active",
    "ending",
] as const satisfies readonly ChildPlacementStatus[];

export const CHILD_PLACEMENT_TERMINAL_STATUSES = [
    "ended",
    "superseded",
    "canceled",
] as const satisfies readonly ChildPlacementStatus[];

export const SCHEDULE_ASSIGNMENT_STATUSES = CHILD_PLACEMENT_STATUSES;
export type ScheduleAssignmentStatus = ChildPlacementStatus;

export const SCHEDULE_ASSIGNMENT_OPERATIONAL_STATUSES = CHILD_PLACEMENT_OPERATIONAL_STATUSES;

export const SCHEDULE_ASSIGNMENT_TERMINAL_STATUSES = CHILD_PLACEMENT_TERMINAL_STATUSES;

const AGREEMENT_OPERATIONAL_SET = new Set<string>(CHILD_ENROLLMENT_AGREEMENT_OPERATIONAL_STATUSES);
const AGREEMENT_TERMINAL_SET = new Set<string>(CHILD_ENROLLMENT_AGREEMENT_TERMINAL_STATUSES);

const PLACEMENT_OPERATIONAL_SET = new Set<string>(CHILD_PLACEMENT_OPERATIONAL_STATUSES);
const PLACEMENT_TERMINAL_SET = new Set<string>(CHILD_PLACEMENT_TERMINAL_STATUSES);

export function isChildEnrollmentAgreementStatus(value: string): value is ChildEnrollmentAgreementStatus {
    return (CHILD_ENROLLMENT_AGREEMENT_STATUSES as readonly string[]).includes(value);
}

export function isAgreementOperationalStatus(status: string): boolean {
    return AGREEMENT_OPERATIONAL_SET.has(status);
}

export function isAgreementTerminalStatus(status: string): boolean {
    return AGREEMENT_TERMINAL_SET.has(status);
}

export function isAgreementNonTerminalStatus(status: string): boolean {
    return isAgreementOperationalStatus(status);
}

export function isChildPlacementStatus(value: string): value is ChildPlacementStatus {
    return (CHILD_PLACEMENT_STATUSES as readonly string[]).includes(value);
}

export function isPlacementOperationalStatus(status: string): boolean {
    return PLACEMENT_OPERATIONAL_SET.has(status);
}

export function isPlacementTerminalStatus(status: string): boolean {
    return PLACEMENT_TERMINAL_SET.has(status);
}

export function isScheduleAssignmentOperationalStatus(status: string): boolean {
    return PLACEMENT_OPERATIONAL_SET.has(status);
}

export function isScheduleAssignmentTerminalStatus(status: string): boolean {
    return PLACEMENT_TERMINAL_SET.has(status);
}

/** Initial agreement status from start date relative to org-local today (YYYY-MM-DD). */
export function deriveAgreementStatusFromStartDate(
    startDate: string | null | undefined,
    todayYmd: string
): ChildEnrollmentAgreementStatus {
    if (!startDate?.trim()) return "pending_start";
    return startDate.trim() > todayYmd ? "pending_start" : "active";
}

/** Placement / schedule assignment status from start date. */
export function derivePlacementStatusFromStartDate(
    startDate: string,
    todayYmd: string
): "planned" | "active" {
    return startDate.trim() > todayYmd ? "planned" : "active";
}
