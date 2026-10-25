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
 * The fallback is the platform's own accent (Bend Pine), the same default the Form Builder shows
 * and saves — one default, so the builder preview and the public form can no longer disagree about
 * what an unbranded form looks like. A tenant's authored accent always wins.
 *
 * ## Painting it
 *
 * `participantBrandStyle` sets `--participant-accent`, `--participant-on-accent` and
 * `--participant-accent-ink` on the shell. `globals.css` maps them to colour utilities with
 * `@theme inline`, so every accent surface inside the shell reads the tenant's colour. Text ON the
 * accent and the accent AS text on white both hold WCAG AA 4.5:1 (S4-D) — chosen automatically, so a
 * light accent gets dark text and a pale accent's links are a darker shade of the same hue.
 *
 * The effective brand (form → location → organization → platform) is resolved server-side
 * (`resolveEffectivePublicBrand`); `participantBrandFromEffective` adapts it to this shape.
 *
 * Pure. No I/O — the caller already holds the form metadata.
 */

import { DEFAULT_FORM_ACCENT } from "@/lib/forms/processingFormBranding";
import {
    BRAND_INK_DARK,
    BRAND_INK_LIGHT,
    brandAccentInk,
    brandOnAccent,
    contrastRatio,
    relativeLuminance,
    type EffectivePublicBrand,
} from "@/lib/branding/publicBrand";

export { contrastRatio, relativeLuminance };

/** Platform default when a tenant has authored no accent — the builder's default, not a second one. */
export const PARTICIPANT_DEFAULT_ACCENT = DEFAULT_FORM_ACCENT;

/** Text on the accent: white where it is legible, otherwise the platform's dark ink (then black). */
export const PARTICIPANT_ON_ACCENT_LIGHT = BRAND_INK_LIGHT;
export const PARTICIPANT_ON_ACCENT_DARK = BRAND_INK_DARK;

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

/**
 * Text on a surface painted in `accent`, at least 4.5:1 (S4-D, Director-approved floor for normal-size
 * button text). Bend Pine itself carries dark ink under this rule: white on it is about 3.2:1.
 */
export function participantOnAccent(accent: string): string {
    return brandOnAccent(accent);
}

/** The participant theme from a server-resolved effective brand. */
export function participantBrandFromEffective(brand: EffectivePublicBrand): ParticipantBrand {
    return { accentColor: brand.accentColor, logoUrl: brand.logoUrl, brandName: brand.displayName };
}

/** CSS custom properties, so both phases inherit one theme from the shell that wraps them. */
export function participantBrandStyle(brand: ParticipantBrand): Record<string, string> {
    return {
        "--participant-accent": brand.accentColor,
        "--participant-on-accent": participantOnAccent(brand.accentColor),
        "--participant-accent-ink": brandAccentInk(brand.accentColor),
    };
}
