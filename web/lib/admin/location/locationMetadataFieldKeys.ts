/** Metadata-backed location field keys — authoring lives in field_definitions (migration-seeded). */

export const LOCATION_ROOM_METADATA_FIELD_KEYS = [
    "category",
    "age_range_from",
    "age_range_to",
    "age_range_unit",
    "capacity",
    "student_teacher_ratio",
] as const;

export const LOCATION_SITE_METADATA_FIELD_KEYS = ["director_name", "director_email", "site_phone"] as const;

export const LOCATION_METADATA_SELECT_FIELD_KEYS = ["category", "age_range_unit"] as const;

/** Default option_set_key references when field_definitions.config is absent. */
export const LOCATION_METADATA_OPTION_SET_KEYS: Record<
    (typeof LOCATION_METADATA_SELECT_FIELD_KEYS)[number],
    string
> = {
    category: "childcare_program_type",
    age_range_unit: "location_age_range_unit",
};

export type LocationFieldDefLike = {
    field_key: string;
    label?: string | null;
    field_type?: string;
    config?: Record<string, unknown> | null;
};

export function labelForLocationFieldKey(
    fieldDefs: LocationFieldDefLike[] | undefined,
    fieldKey: string,
    fallback: string
): string {
    const def = fieldDefs?.find((d) => d.field_key === fieldKey);
    const label = String(def?.label ?? "").trim();
    return label || fallback;
}
