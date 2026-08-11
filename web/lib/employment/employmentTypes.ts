/**
 * Employment vocabulary and row shapes.
 *
 * Keep aligned with supabase/migrations/20260811120000_employment_foundation_v1.sql.
 *
 * Employment answers "does this person work for this org, in what operational
 * capacity, and since when". It never answers "can this person sign in" — see
 * docs/platform/core/data/relationship-model.md.
 */

/** Mirrors child_enrollment_agreements: the same shape of effective-dated org relationship. */
export const EMPLOYMENT_STATUSES = [
    "pending_start",
    "active",
    "ending",
    "ended",
    "canceled",
] as const;

export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number];

/** Non-terminal — the person currently holds this employment relationship. */
export const EMPLOYMENT_OPEN_STATUSES = [
    "pending_start",
    "active",
    "ending",
] as const satisfies readonly EmploymentStatus[];

export const EMPLOYMENT_TERMINAL_STATUSES = [
    "ended",
    "canceled",
] as const satisfies readonly EmploymentStatus[];

/**
 * Platform-operational and jurisdiction-neutral. Vertical staff facts (CPR,
 * background check, training hours, ratio qualification) are configured through
 * field_definitions with entity_type = "employment" — never columns here.
 */
export const EMPLOYMENT_TYPES = [
    "full_time",
    "part_time",
    "temporary",
    "contract",
    "volunteer",
] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

const OPEN_SET = new Set<string>(EMPLOYMENT_OPEN_STATUSES);

export function isEmploymentStatus(value: unknown): value is EmploymentStatus {
    return (EMPLOYMENT_STATUSES as readonly string[]).includes(String(value ?? "").trim());
}

export function isEmploymentType(value: unknown): value is EmploymentType {
    return (EMPLOYMENT_TYPES as readonly string[]).includes(String(value ?? "").trim());
}

export function isOpenEmploymentStatus(status: string | null | undefined): boolean {
    return OPEN_SET.has(String(status ?? "").trim());
}

export type EmploymentRow = {
    id: string;
    org_id: string;
    person_id: string;
    employment_status: EmploymentStatus;
    employment_type: EmploymentType | null;
    position_id: string | null;
    primary_location_id: string | null;
    external_employee_id: string | null;
    start_date: string;
    end_date: string | null;
    end_reason_key: string | null;
    source_key: string;
    supersedes_employment_id: string | null;
    metadata: Record<string, unknown>;
    created_by: string | null;
    updated_by: string | null;
    created_at: string;
    updated_at: string;
};

export type EmploymentPositionRow = {
    id: string;
    org_id: string;
    key: string;
    label: string;
    description: string | null;
    is_active: boolean;
    sort_order: number;
};

export const EMPLOYMENT_SELECT_COLUMNS =
    "id, org_id, person_id, employment_status, employment_type, position_id, primary_location_id, " +
    "external_employee_id, start_date, end_date, end_reason_key, source_key, supersedes_employment_id, " +
    "metadata, created_by, updated_by, created_at, updated_at";

/**
 * Status implied by an effective window on a given day. The database is the
 * authority for eligibility (`person_is_employed_on`); this only keeps operator
 * status coherent with the dates it was authored with.
 */
export function resolveEmploymentStatusForDates(
    startDate: string,
    endDate: string | null,
    todayYmd: string
): EmploymentStatus {
    if (endDate && endDate < todayYmd) return "ended";
    if (startDate > todayYmd) return "pending_start";
    if (endDate) return "ending";
    return "active";
}
