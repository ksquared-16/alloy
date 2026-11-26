/**
 * Programs domain — Program Offerings primitive.
 *
 * Ownership: Programs. Consumed by Commercial (rates), Enrollment,
 * Scheduling, Capacity, Attendance, Analytics, AI.
 *
 * An offering represents the attendance TYPE: Full Day, Part Day, Drop-In, etc.
 * Quantity variants (2 days/week, 5 days/week) live in program_offering_variants.
 * Commercial tuition rates attach to variants, not directly to offerings.
 */

export type AttendanceType =
    | "full_time"
    | "part_time"
    | "drop_in"
    | "hourly"
    | "before_school"
    | "after_school"
    | "custom";

export type OfferingStatus =
    | "active"
    | "draft"
    | "coming_soon"
    | "seasonal"
    | "retired"
    | "archived";

export type ProgramOffering = {
    id: string;
    org_id: string;
    program_key: string;
    label: string;
    attendance_type: AttendanceType;
    status: OfferingStatus;
    effective_start: string | null;
    effective_end: string | null;
    sort_order: number;
    is_active: boolean;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string | null;
};

export const ATTENDANCE_TYPE_LABELS: Record<AttendanceType, string> = {
    full_time: "Full Time",
    part_time: "Part Time",
    drop_in: "Drop-in",
    hourly: "Hourly",
    before_school: "Before School",
    after_school: "After School",
    custom: "Custom",
};

/** Attendance types that do NOT typically have quantity variants (transparent default variant). */
export const NO_QUANTITY_ATTENDANCE_TYPES = new Set<AttendanceType>([
    "drop_in",
    "hourly",
    "before_school",
    "after_school",
]);

export const OFFERING_STATUS_LABELS: Record<OfferingStatus, string> = {
    active: "Active",
    draft: "Draft",
    coming_soon: "Coming Soon",
    seasonal: "Seasonal",
    retired: "Retired",
    archived: "Archived",
};

/** Whether an offering is customer-visible (not draft/retired/archived). */
export function isOfferingVisible(offering: ProgramOffering): boolean {
    return (
        offering.is_active &&
        (offering.status === "active" ||
            offering.status === "coming_soon" ||
            offering.status === "seasonal")
    );
}

/** Sort offerings by sort_order then label. */
export function sortOfferings(offerings: ProgramOffering[]): ProgramOffering[] {
    return [...offerings].sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return a.label.localeCompare(b.label);
    });
}
