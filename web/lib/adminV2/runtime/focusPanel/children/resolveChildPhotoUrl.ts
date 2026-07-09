const CHILD_PHOTO_KEYS = [
    "photo_url",
    "avatar_url",
    "profile_photo_url",
    "profile_image_url",
] as const;

function trimUrl(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

/**
 * Resolve a child profile image URL from inquiry-child truth or custom fields.
 * No fabricated URLs — returns null when no photo source exists.
 */
export function resolveChildPhotoUrlFromRaw(row: Record<string, unknown>): string | null {
    for (const key of CHILD_PHOTO_KEYS) {
        const direct = trimUrl(row[key]);
        if (direct) return direct;
    }
    const custom = row.custom_fields;
    if (custom && typeof custom === "object") {
        const fields = custom as Record<string, unknown>;
        for (const key of CHILD_PHOTO_KEYS) {
            const nested = trimUrl(fields[key]);
            if (nested) return nested;
        }
    }
    return null;
}
