/**
 * The tenant's brand, for every phase of the participant experience.
 *
 * ## One owner, not a Participant-Runtime theme
 *
 * Brand tokens are already authored — `logo_url`, `brand_name`, `accent_color` live on
 * `form_definitions.metadata` and are edited in the Processing Form Builder. What did not exist was
 * anything READING them on the public surface: `ParentIntakeShell` carried a hardcoded mark, so
 * every tenant's parents saw the same one.
 *
 * So this is the single resolver, and both phases — the conversation and the artifact review — are
 * rendered inside the shell it themes. A Participant-Runtime-specific theme would have guaranteed
 * the two phases could drift, which is the opposite of one coherent Enrollment interaction.
 *
 * ## Nothing tenant-specific is hardcoded
 *
 * The fallback is the platform's own neutral accent, not any tenant's colour. Firefly renders in its
 * established treatment because its forms carry `accent_color: #00A283` — resolved, not special-cased.
 *
 * Pure. No I/O — the caller already holds the form metadata.
 */

/** Platform default when a tenant has authored no accent. Never a tenant's colour. */
export const PARTICIPANT_DEFAULT_ACCENT = "#1F2937";

export type ParticipantBrand = {
    readonly accentColor: string;
    readonly logoUrl: string | null;
    readonly brandName: string | null;
};

function readString(source: Record<string, unknown>, key: string): string | null {
    const raw = source[key];
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/** Only `#rgb` / `#rrggbb`. An unvalidated value reaches a style attribute, so it is not trusted. */
function safeAccent(raw: string | null): string | null {
    if (!raw) return null;
    return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw) ? raw : null;
}

export function resolveParticipantBrand(formMetadata: unknown): ParticipantBrand {
    const source =
        formMetadata != null && typeof formMetadata === "object" && !Array.isArray(formMetadata)
            ? (formMetadata as Record<string, unknown>)
            : {};

    return {
        accentColor: safeAccent(readString(source, "accent_color")) ?? PARTICIPANT_DEFAULT_ACCENT,
        // An http(s) URL or nothing — a logo slot is an image source on a public page.
        logoUrl: (() => {
            const raw = readString(source, "logo_url");
            return raw && /^https?:\/\//i.test(raw) ? raw : null;
        })(),
        brandName: readString(source, "brand_name"),
    };
}

/** CSS custom properties, so both phases inherit one theme from the shell that wraps them. */
export function participantBrandStyle(brand: ParticipantBrand): Record<string, string> {
    return { "--participant-accent": brand.accentColor };
}
