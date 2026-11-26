/**
 * Identity avatar — part of the card EVIDENCE model (not hardcoded presentation).
 *
 * Identity rows (Household contacts / members, Child, Staff later) carry a profile
 * image. When no image exists we fall back to initials. Cards that declare
 * `supportsProfileImage` (see focusPanelCardLifecycle.ts) render this; diagnostic /
 * metric / billing / timeline cards never do.
 *
 * Pure + server-safe so the model is testable and shared by Builder + runtime.
 *
 * Semantic role tokens convey identity type/role — never sex attribute or operational status.
 * Badges convey Primary / Parent / Enrolling / Tour Scheduled, etc.
 */

/** Semantic identity roles for avatar accent (shared Builder + runtime). */
export type IdentityAvatarSemanticRole =
    | "primary_contact"
    | "other_parent_guardian"
    | "contact"
    | "child";

/** Resolved avatar evidence for one identity row. */
export type FocusPanelIdentityAvatar = {
    /** Display name the avatar represents (for alt text + initials). */
    name: string;
    /** Profile image URL, or null → render the initials fallback. */
    imageUrl: string | null;
    /** 1–2 letter initials fallback (always present). */
    initials: string;
    /**
     * Stable accent bucket (0–5).
     * Prefer `role` for Primary / Other Parent / contact tokens; children use
     * a deterministic id/name hash into this palette.
     */
    tone: number;
    /** Semantic identity role for CSS tokens (not operational status). */
    role: IdentityAvatarSemanticRole;
};

const AVATAR_TONES = 6;

/** Child palette offsets within the shared tone CSS (deterministic, not gendered). */
const CHILD_TONE_BASE = 0;

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

/** Deterministic 0..5 tone from a stable record id (children palette). */
export function avatarToneForRecordId(recordId: string): number {
    const seed = recordId.trim() || "child";
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) hash = (hash * 33 + seed.charCodeAt(i)) >>> 0;
    return (CHILD_TONE_BASE + (hash % AVATAR_TONES)) % AVATAR_TONES;
}

export type ResolveIdentityAvatarOptions = {
    role?: IdentityAvatarSemanticRole;
    /** Preferred for children — stable across rename. */
    recordId?: string;
};

/**
 * Resolve identity avatar evidence from a name + optional image + semantic role.
 * A blank/whitespace image URL is treated as no image (initials fallback). PURE.
 */
export function resolveIdentityAvatar(
    name: string,
    imageUrl?: string | null,
    opts?: ResolveIdentityAvatarOptions,
): FocusPanelIdentityAvatar {
    const cleanName = name?.trim() || "Unknown";
    const cleanImage = imageUrl?.trim() ? imageUrl.trim() : null;
    const role: IdentityAvatarSemanticRole = opts?.role ?? "contact";
    let tone: number;
    if (role === "primary_contact") {
        tone = 3; // Alloy blue bucket (CSS also keys off role)
    } else if (role === "other_parent_guardian") {
        tone = 3; // Alloy blue bucket (CSS also keys off role)
    } else if (role === "child") {
        tone = avatarToneForRecordId(opts?.recordId ?? cleanName);
    } else {
        tone = 5; // neutral contact
    }
    return {
        name: cleanName,
        imageUrl: cleanImage,
        initials: initialsFromName(cleanName),
        tone,
        role,
    };
}

/** True when a role string implies primary contact. */
export function inferAvatarRoleFromSectionKey(sectionKey: string | undefined | null): IdentityAvatarSemanticRole {
    switch (sectionKey) {
        case "primary_contact":
            return "primary_contact";
        case "other_parent_guardian":
            return "other_parent_guardian";
        case "roster":
        case "children":
            return "child";
        default:
            return "contact";
    }
}
