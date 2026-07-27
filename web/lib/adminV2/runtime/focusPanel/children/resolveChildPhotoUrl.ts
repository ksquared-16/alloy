import { resolveIdentityPhotoUrlFromRaw } from "@/lib/adminV2/runtime/focusPanel/resolveIdentityPhotoUrl";

/**
 * Resolve a child profile image URL from inquiry-child truth or custom fields.
 * No fabricated URLs — returns null when no photo source exists.
 */
export function resolveChildPhotoUrlFromRaw(row: Record<string, unknown>): string | null {
    return resolveIdentityPhotoUrlFromRaw(row);
}
