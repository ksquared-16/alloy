/**
 * Resolve a profile image URL from observed identity truth (person / child rows).
 * No fabricated URLs — returns null when no photo source exists.
 */

const PHOTO_KEYS = [
    "photo_url",
    "avatar_url",
    "profile_photo_url",
    "profile_image_url",
    "image_url",
] as const;

function trimUrl(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

function readFromRecord(row: Record<string, unknown>): string | null {
    for (const key of PHOTO_KEYS) {
        const direct = trimUrl(row[key]);
        if (direct) return direct;
    }
    return null;
}

function readFromBag(bag: unknown): string | null {
    if (!bag || typeof bag !== "object") return null;
    return readFromRecord(bag as Record<string, unknown>);
}

/**
 * Prefer top-level keys, then `custom_fields`, then `metadata` — matching person /
 * inquiry-child evidence shapes used across Focus Panel identity cards.
 */
export function resolveIdentityPhotoUrlFromRaw(row: Record<string, unknown> | null | undefined): string | null {
    if (!row) return null;
    return (
        readFromRecord(row)
        ?? readFromBag(row.custom_fields)
        ?? readFromBag(row.metadata)
        ?? null
    );
}

/** Extract a photo URL from a persons.metadata jsonb value (or plain object). */
export function resolveIdentityPhotoUrlFromMetadata(metadata: unknown): string | null {
    return readFromBag(metadata);
}
