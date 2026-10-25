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
 * `participantBrandStyle` sets `--participant-accent` and `--participant-on-accent` on the shell.
 * `globals.css` maps them to the `participant-accent` / `participant-on-accent` colour utilities with
 * `@theme inline`, so every accent surface inside the shell reads the tenant's colour. The on-accent
 * text colour is chosen for contrast: a light accent gets dark text instead of failing WCAG AA with
 * white.
 *
 * Pure. No I/O — the caller already holds the form metadata.
 */

import { DEFAULT_FORM_ACCENT } from "@/lib/forms/processingFormBranding";

/** Platform default when a tenant has authored no accent — the builder's default, not a second one. */
export const PARTICIPANT_DEFAULT_ACCENT = DEFAULT_FORM_ACCENT;

/** Text on the accent: white where it is legible, otherwise the platform's dark ink. */
export const PARTICIPANT_ON_ACCENT_LIGHT = "#FFFFFF";
export const PARTICIPANT_ON_ACCENT_DARK = "#18273A";

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

function channel(value: number): number {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.x relative luminance of a `#rgb` / `#rrggbb` colour. */
export function relativeLuminance(hex: string): number {
    const raw = hex.replace("#", "");
    const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
    const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
}

/**
 * The text colour for a surface painted in `accent`: white while it holds at least 3:1 (the WCAG
 * floor for large text and UI components), otherwise whichever of the two inks contrasts more — so a
 * pale tenant accent (yellow, light blue) gets dark text instead of near-invisible white.
 *
 * Known limit: 3:1 is below AA's 4.5:1 for 14px button labels. The platform default itself is
 * white-on-Bend-Pine at about 3.2:1, the look every public form has today; raising the floor would
 * restyle every unbranded form and is a brand decision, not this resolver's.
 */
export function participantOnAccent(accent: string): string {
    const white = contrastRatio(accent, PARTICIPANT_ON_ACCENT_LIGHT);
    if (white >= 3) return PARTICIPANT_ON_ACCENT_LIGHT;
    return contrastRatio(accent, PARTICIPANT_ON_ACCENT_DARK) > white ? PARTICIPANT_ON_ACCENT_DARK : PARTICIPANT_ON_ACCENT_LIGHT;
}

/** CSS custom properties, so both phases inherit one theme from the shell that wraps them. */
export function participantBrandStyle(brand: ParticipantBrand): Record<string, string> {
    return {
        "--participant-accent": brand.accentColor,
        "--participant-on-accent": participantOnAccent(brand.accentColor),
    };
}
