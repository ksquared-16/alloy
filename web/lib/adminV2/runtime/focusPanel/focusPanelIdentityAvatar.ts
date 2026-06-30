/**
 * Identity avatar — part of the card EVIDENCE model (not hardcoded presentation).
 *
 * Identity rows (Household contacts / members, Child, Staff later) carry a profile
 * image. When no image exists we fall back to initials. Cards that declare
 * `supportsProfileImage` (see focusPanelCardLifecycle.ts) render this; diagnostic /
 * metric / billing / timeline cards never do.
 *
 * Pure + server-safe so the model is testable and shared by every identity card.
 */

/** Resolved avatar evidence for one identity row. */
export type FocusPanelIdentityAvatar = {
    /** Display name the avatar represents (for alt text + initials). */
    name: string;
    /** Profile image URL, or null → render the initials fallback. */
    imageUrl: string | null;
    /** 1–2 letter initials fallback (always present). */
    initials: string;
    /** Stable accent bucket (0–5) so fallbacks are colorful but deterministic. */
    tone: number;
};

const AVATAR_TONES = 6;

/** Derive 1–2 uppercase initials from a person's name (handles single names). */
export function initialsFromName(name: string): string {
    const parts = name
        .trim()
        .split(/\s+/)
        .filter((p) => /[a-z0-9]/i.test(p));
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Deterministic 0..5 tone bucket from a name (stable per person, no randomness). */
export function avatarToneForName(name: string): number {
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return hash % AVATAR_TONES;
}

/**
 * Resolve identity avatar evidence from a name + optional image. A blank/whitespace
 * image URL is treated as no image (initials fallback). PURE.
 */
export function resolveIdentityAvatar(name: string, imageUrl?: string | null): FocusPanelIdentityAvatar {
    const cleanName = name?.trim() || "Unknown";
    const cleanImage = imageUrl?.trim() ? imageUrl.trim() : null;
    return {
        name: cleanName,
        imageUrl: cleanImage,
        initials: initialsFromName(cleanName),
        tone: avatarToneForName(cleanName),
    };
}
