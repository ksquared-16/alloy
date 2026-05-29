/** Config/presentation keys stored on `locations.metadata` (no schema migration). */
export const LOCATION_METADATA_FIELD_KEYS = {
    director_name: "director_name",
    director_email: "director_email",
    site_phone: "site_phone",
    category: "category",
    semantic_kind: "semantic_kind",
    age_range_from: "age_range_from",
    age_range_to: "age_range_to",
    age_range_unit: "age_range_unit",
    capacity: "capacity",
    student_teacher_ratio: "student_teacher_ratio",
    ratio: "ratio",
    ratio_licensing_notes: "ratio_licensing_notes",
} as const;

export type LocationMetadataPresentation = {
    director_name: string | null;
    director_email: string | null;
    site_phone: string | null;
    category: string | null;
    age_range_from: string | null;
    age_range_to: string | null;
    age_range_unit: string | null;
    capacity: string | null;
    student_teacher_ratio: string | null;
};

export function readLocationMetadataPresentation(metadata: unknown): LocationMetadataPresentation {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) {
        return {
            director_name: null,
            director_email: null,
            site_phone: null,
            category: null,
            age_range_from: null,
            age_range_to: null,
            age_range_unit: null,
            capacity: null,
            student_teacher_ratio: null,
        };
    }
    const m = metadata as Record<string, unknown>;
    const str = (k: string) => {
        const v = m[k];
        return typeof v === "string" && v.trim() ? v.trim() : v != null && String(v).trim() ? String(v).trim() : null;
    };
    const category = str("category") ?? str("semantic_kind") ?? str("room_category");
    const studentTeacherRatio =
        str("student_teacher_ratio") ?? str("ratio") ?? str("ratio_licensing_notes") ?? str("licensing_ratio");
    return {
        director_name: str("director_name"),
        director_email: str("director_email"),
        site_phone: str("site_phone"),
        category,
        age_range_from: str("age_range_from"),
        age_range_to: str("age_range_to"),
        age_range_unit: str("age_range_unit"),
        capacity: str("capacity"),
        student_teacher_ratio: studentTeacherRatio,
    };
}

export function formatLocationAgeRange(
    from: string | null,
    to: string | null,
    unit?: string | null
): string | null {
    if (from && to) {
        const suffix = unit ? ` ${unit}` : "";
        return `${from}–${to}${suffix}`;
    }
    const single = from ?? to;
    if (!single) return null;
    return unit ? `${single} ${unit}` : single;
}

export function mergeLocationMetadataPatch(
    existing: unknown,
    patch: Partial<Record<keyof LocationMetadataPresentation, string | null>>
): Record<string, unknown> {
    const base =
        existing != null && typeof existing === "object" && !Array.isArray(existing)
            ? { ...(existing as Record<string, unknown>) }
            : {};
    for (const [k, v] of Object.entries(patch)) {
        if (v == null || String(v).trim() === "") {
            delete base[k];
            if (k === "student_teacher_ratio") {
                delete base.ratio;
                delete base.ratio_licensing_notes;
            }
        } else {
            base[k] = String(v).trim();
            if (k === "student_teacher_ratio") {
                delete base.ratio;
                delete base.ratio_licensing_notes;
            }
        }
    }
    return base;
}
