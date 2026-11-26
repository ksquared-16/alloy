/**
 * The public shape of Enrollment, Placement, Schedule and Staff.
 *
 * Three commitments, kept separate because the domain keeps them separate: an agreement says a
 * child is enrolled at a site from a date; a placement says which room, superseding the one
 * before; a schedule assignment says which recurring pattern applies. Collapsing them would be
 * smaller and would lose the ability to answer any of the three precisely.
 *
 * Every mapper is an explicit allow-list. Internal actor identity (`created_by`/`updated_by`),
 * operator machinery (`source_key`, `reason_key`, `activation_policy_key`), sales-pipeline
 * linkage and unbounded `metadata` are absent from all of them.
 */

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export type PublicEnrollment = {
    id: string; child_id: string; household_id: string | null; site_location_id: string | null;
    status: string | null; start_date: string | null; end_date: string | null;
};

export function toPublicEnrollment(row: Row): PublicEnrollment {
    return {
        id: String(row.id),
        child_id: String(row.child_id),
        household_id: str(row.household_id),
        site_location_id: str(row.site_location_id),
        status: str(row.status),
        start_date: str(row.start_date),
        end_date: str(row.end_date),
    };
}

export type PublicPlacement = {
    id: string; enrollment_id: string | null; child_id: string;
    site_location_id: string | null; room_location_id: string | null;
    program_category_id: string | null; status: string | null;
    start_date: string | null; end_date: string | null; supersedes_placement_id: string | null;
};

export function toPublicPlacement(row: Row): PublicPlacement {
    return {
        id: String(row.id),
        enrollment_id: str(row.enrollment_id),
        child_id: String(row.child_id),
        // Location ids from the topology `/api/v1/locations` already publishes — a partner
        // resolves the room through a resource it already syncs, not a second room vocabulary.
        site_location_id: str(row.site_location_id),
        room_location_id: str(row.room_location_id),
        program_category_id: str(row.program_category_id),
        status: str(row.status),
        start_date: str(row.start_date),
        end_date: str(row.end_date),
        supersedes_placement_id: str(row.supersedes_placement_id),
    };
}

export type PublicScheduleAssignment = {
    id: string; enrollment_id: string | null; child_id: string;
    site_location_id: string | null; room_location_id: string | null;
    schedule_pattern_id: string | null; pattern_label: string | null;
    schedule_type_key: string | null; weekdays: number[];
    status: string | null; commitment_kind: string | null; is_primary: boolean;
    start_date: string | null; end_date: string | null; supersedes_assignment_id: string | null;
};

export function toPublicScheduleAssignment(row: Row): PublicScheduleAssignment {
    return {
        id: String(row.id),
        enrollment_id: str(row.enrollment_id),
        child_id: String(row.child_id),
        site_location_id: str(row.site_location_id),
        room_location_id: str(row.room_location_id),
        schedule_pattern_id: str(row.schedule_pattern_id),
        pattern_label: str(row.pattern_label),
        schedule_type_key: str(row.schedule_type_key),
        // 0 = Sunday, matching the pattern's own vocabulary rather than inventing a second one.
        weekdays: Array.isArray(row.weekdays) ? (row.weekdays as number[]) : [],
        status: str(row.status),
        commitment_kind: str(row.commitment_kind),
        is_primary: row.is_primary === true,
        start_date: str(row.start_date),
        end_date: str(row.end_date),
        supersedes_assignment_id: str(row.supersedes_assignment_id),
    };
}

/** A generated day. It carries no id and no watermark, because it is not a stored object. */
export type PublicScheduleDay = {
    date: string; weekday: number; child_id: string;
    site_location_id: string | null; room_location_id: string | null;
    schedule_assignment_id: string; schedule_pattern_id: string | null;
    schedule_type_key: string | null;
};

export function toPublicScheduleDay(row: Row): PublicScheduleDay {
    return {
        date: String(row.date),
        weekday: typeof row.weekday === "number" ? row.weekday : Number(row.weekday),
        child_id: String(row.child_id),
        site_location_id: str(row.site_location_id),
        room_location_id: str(row.room_location_id),
        schedule_assignment_id: String(row.schedule_assignment_id),
        schedule_pattern_id: str(row.schedule_pattern_id),
        schedule_type_key: str(row.schedule_type_key),
    };
}

export type PublicStaff = {
    id: string; person_id: string; external_employee_id: string | null; badge_number: string | null;
    first_name: string | null; last_name: string | null;
    email?: string | null; phone?: string | null;
    employment_status: string | null; employment_type: string | null;
    position_label: string | null; primary_location_id: string | null;
    start_date: string | null; end_date: string | null;
};

/**
 * `id` is the EMPLOYMENT id, not a new staff identity. Staff is a projection over Person and
 * Employment; no staff table exists and none is created. Compensation, payroll, tax, HR notes,
 * safeguarding and internal access grants are absent because the authority never joins them.
 */
export function toPublicStaff(row: Row, includeContact: boolean): PublicStaff {
    const base: PublicStaff = {
        id: String(row.id),
        person_id: String(row.person_id),
        external_employee_id: str(row.external_employee_id),
        badge_number: str(row.badge_number),
        first_name: str(row.first_name),
        last_name: str(row.last_name),
        employment_status: str(row.employment_status),
        employment_type: str(row.employment_type),
        position_label: str(row.position_label),
        primary_location_id: str(row.primary_location_id),
        start_date: str(row.start_date),
        end_date: str(row.end_date),
    };
    if (!includeContact) return base;
    return { ...base, email: str(row.email), phone: str(row.phone) };
}
