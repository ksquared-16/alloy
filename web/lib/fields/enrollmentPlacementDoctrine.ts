/**
 * Enrollment placement operator doctrine (E2).
 * Operator labels: Location, Program, Room, Schedule — not internal storage names.
 */

export const ENROLLMENT_PLACEMENT_OPERATOR_LABELS = {
    location: "Location",
    program: "Program",
    room: "Room",
    schedule: "Schedule",
} as const;

export const ENROLLMENT_PLACEMENT_PROGRAM_FIELD_KEY = "desired_program_category_id" as const;

export const ENROLLMENT_PLACEMENT_LEGACY_PROGRAM_FIELD_KEY = "desired_program_type" as const;

const PLACEMENT_LABEL_BY_FIELD_KEY: Readonly<Record<string, string>> = {
    location_id: ENROLLMENT_PLACEMENT_OPERATOR_LABELS.location,
    child_location_id: ENROLLMENT_PLACEMENT_OPERATOR_LABELS.location,
    desired_program_category_id: ENROLLMENT_PLACEMENT_OPERATOR_LABELS.program,
    desired_program_type: ENROLLMENT_PLACEMENT_OPERATOR_LABELS.program,
    child_program: ENROLLMENT_PLACEMENT_OPERATOR_LABELS.program,
    program: ENROLLMENT_PLACEMENT_OPERATOR_LABELS.program,
    program_room_cohort_key: ENROLLMENT_PLACEMENT_OPERATOR_LABELS.room,
    child_program_room_cohort_key: ENROLLMENT_PLACEMENT_OPERATOR_LABELS.room,
    desired_schedule_type: ENROLLMENT_PLACEMENT_OPERATOR_LABELS.schedule,
};

export function enrollmentPlacementOperatorLabel(fieldKey: string, storedLabel?: string | null): string {
    const override = PLACEMENT_LABEL_BY_FIELD_KEY[fieldKey.trim()];
    if (override) return override;
    const trimmed = (storedLabel ?? "").trim();
    return trimmed || fieldKey;
}

export const ENROLLMENT_PLACEMENT_PROGRAM_DISABLED_HELPER = "Choose a location first." as const;

export const ENROLLMENT_PLACEMENT_PROGRAM_EMPTY_HELPER =
    "No programs configured for this location." as const;

export const ENROLLMENT_PLACEMENT_LOCATION_MISMATCH_NOTICE =
    "This child is assigned to a different location than the family lead. Is that intentional?" as const;

/** Location-owned offerings — configurable, not hardcoded. */
export const LOCATION_OWNERSHIP_MODEL = {
    programs: {
        operator_label: ENROLLMENT_PLACEMENT_OPERATOR_LABELS.program,
        storage_table: "location_program_categories",
        settings_path: "/settings/locations",
        scoped_by: "location_id",
    },
    rooms: {
        operator_label: ENROLLMENT_PLACEMENT_OPERATOR_LABELS.room,
        storage_table: "locations",
        storage_detail: "unit rows + metadata.category/capacity",
        required_at: "enrollment_placement",
        scoped_by: "parent site location_id",
    },
    schedules: {
        operator_label: ENROLLMENT_PLACEMENT_OPERATOR_LABELS.schedule,
        storage_interim: "option_set:childcare_schedule_type (org-wide)",
        storage_future: "location-scoped schedule offerings (not built)",
        preference_field: "desired_schedule_type",
    },
} as const;

/** Program MVP storage — category FK on OCM, options from location_program_categories. */
export const ENROLLMENT_PROGRAM_MODEL = {
    operator_label: ENROLLMENT_PLACEMENT_OPERATOR_LABELS.program,
    storage_field_key: ENROLLMENT_PLACEMENT_PROGRAM_FIELD_KEY,
    legacy_field_key: ENROLLMENT_PLACEMENT_LEGACY_PROGRAM_FIELD_KEY,
    storage_table: "opportunity_customer_members",
    storage_column: "desired_program_category_id",
    option_source: "programs_for_location" as const,
    depends_on_field_key: "location_id" as const,
} as const;
