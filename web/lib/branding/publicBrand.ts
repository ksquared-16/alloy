/**
 * The public brand a family sees — on a public form, a packet, and the tour booking page (S4).
 *
 * ## One vocabulary, four layers
 *
 *   form-specific override → location → organization → platform
 *
 * Each FIELD resolves independently: a location that sets only a colour still shows the
 * organization's name and logo. The organization and location layers live at
 * `org_settings.metadata.public_brand_v1` and `locations.metadata.public_brand_v1`; the form layer is
 * the form's own `brand_name` / `accent_color` / `logo_url`, frozen into each published version
 * (`brand_snapshot_v1`) so a draft edit never restyles a live form.
 *
 * ## The form layer and the builder's old default
 *
 * The Form Builder has always WRITTEN `accent_color` on save, defaulting it to Bend Pine. So a stored
 * Bend Pine on a form that never chose a brand source is the builder's default, not an authored
 * override: it falls through to the school's brand. Any other stored colour, or an explicit
 * `brand_source: "form"`, overrides. `brand_source: "inherit"` ignores the form's values entirely.
 * With no school brand configured the fall-through lands on Bend Pine again — no unbranded form
 * changes appearance.
 *
 * Pure. Loading is `loadPublicBrandLayers` (server).
 */

import { DEFAULT_FORM_ACCENT } from "@/lib/forms/processingFormBranding";

export const PUBLIC_BRAND_METADATA_KEY = "public_brand_v1";
export const FORM_BRAND_SNAPSHOT_KEY = "brand_snapshot_v1";
export const PUBLIC_BRAND_NAME_MAX = 80;
export const PUBLIC_BRAND_PLATFORM_ACCENT = DEFAULT_FORM_ACCENT;

export type PublicBrandValues = {
    display_name: string | null;
    accent_color: string | null;
    logo_url: string | null;
    /**
     * The words on the school's public tour button (P1-B) — the hosted calendar's heading and the
     * website button snippet. Organization and location layers only; a form never sets it.
     */
    tour_cta_label?: string | null;
};

export const EMPTY_PUBLIC_BRAND: PublicBrandValues = { display_name: null, accent_color: null, logo_url: null, tour_cta_label: null };

/** The platform's tour call to action when no school has written its own (Director, P1-B). */
export const PUBLIC_TOUR_CTA_DEFAULT = "Schedule a Tour";
export const PUBLIC_TOUR_CTA_MAX = 40;

export type PublicBrandSource = "form" | "location" | "organization" | "platform";

export type EffectivePublicBrand = {
    displayName: string | null;
    accentColor: string;
    logoUrl: string | null;
    tourCtaLabel: string;
    sources: {
        displayName: PublicBrandSource;
        accentColor: PublicBrandSource;
        logoUrl: PublicBrandSource;
        tourCtaLabel: PublicBrandSource;
    };
};

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** `#abc` / `#AABBCC` → `#AABBCC`; anything else is not a colour that may reach a style attribute. */
export function normalizeBrandColor(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const v = raw.trim();
    if (!HEX.test(v)) return null;
    const body = v.slice(1);
    const full = body.length === 3 ? body.split("").map((c) => c + c).join("") : body;
    return `#${full.toUpperCase()}`;
}

/** A logo is an image source on a public page: https only for school-level brand. */
export function normalizeBrandLogoUrl(raw: unknown, opts: { allowHttp?: boolean } = {}): string | null {
    if (typeof raw !== "string") return null;
    const v = raw.trim();
    if (!v || v.length > 2048) return null;
    const re = opts.allowHttp ? /^https?:\/\/[^\s"'<>]+$/i : /^https:\/\/[^\s"'<>]+$/i;
    return re.test(v) ? v : null;
}

export function normalizeBrandName(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const v = raw.replace(/\s+/g, " ").trim();
    return v ? v.slice(0, PUBLIC_BRAND_NAME_MAX) : null;
}

/** One line of button text: whitespace collapsed, no markup characters, at most 40 characters. */
export function normalizeTourCtaLabel(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const v = raw.replace(/\s+/g, " ").trim();
    if (!v || /[<>]/.test(v)) return null;
    return v.slice(0, PUBLIC_TOUR_CTA_MAX);
}

/** Read a stored `public_brand_v1` value (org or location), dropping anything unsafe. */
export function readPublicBrandValues(metadata: unknown): PublicBrandValues {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return { ...EMPTY_PUBLIC_BRAND };
    const raw = (metadata as Record<string, unknown>)[PUBLIC_BRAND_METADATA_KEY];
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return { ...EMPTY_PUBLIC_BRAND };
    const o = raw as Record<string, unknown>;
    return {
        display_name: normalizeBrandName(o.display_name),
        accent_color: normalizeBrandColor(o.accent_color),
        logo_url: normalizeBrandLogoUrl(o.logo_url),
        tour_cta_label: normalizeTourCtaLabel(o.tour_cta_label),
    };
}

/** Server validation for a brand write. `null` / empty = inherit. A malformed value is refused, not dropped. */
export function validatePublicBrandInput(input: unknown): { ok: true; values: PublicBrandValues } | { ok: false; error: string } {
    if (input == null || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Invalid brand payload" };
    const o = input as Record<string, unknown>;
    const unknown = Object.keys(o).find((k) => !["display_name", "accent_color", "logo_url", "tour_cta_label"].includes(k));
    if (unknown) return { ok: false, error: `Unsupported brand field: ${unknown}` };
    const blank = (v: unknown) => v === undefined || v === null || (typeof v === "string" && !v.trim());
    const accent = blank(o.accent_color) ? null : normalizeBrandColor(o.accent_color);
    if (!blank(o.accent_color) && !accent) return { ok: false, error: "Colour must be a hex value like #1F6FEB" };
    const logo = blank(o.logo_url) ? null : normalizeBrandLogoUrl(o.logo_url);
    if (!blank(o.logo_url) && !logo) return { ok: false, error: "Logo must be an https:// image address" };
    if (!blank(o.display_name) && typeof o.display_name !== "string") return { ok: false, error: "Display name must be text" };
    const cta = blank(o.tour_cta_label) ? null : normalizeTourCtaLabel(o.tour_cta_label);
    if (!blank(o.tour_cta_label) && !cta) return { ok: false, error: "Button text must be plain text" };
    if (typeof o.tour_cta_label === "string" && o.tour_cta_label.replace(/\s+/g, " ").trim().length > PUBLIC_TOUR_CTA_MAX) {
        return { ok: false, error: `Button text is limited to ${PUBLIC_TOUR_CTA_MAX} characters` };
    }
    return {
        ok: true,
        values: {
            display_name: blank(o.display_name) ? null : normalizeBrandName(o.display_name),
            accent_color: accent,
            logo_url: logo,
            tour_cta_label: cta,
        },
    };
}

/**
 * The form layer from a form's metadata — or from a published version's snapshot of it.
 * Returns only what the form actually authored (see the module note on the builder default).
 */
export function formBrandLayer(formBrand: unknown): PublicBrandValues | null {
    if (formBrand == null || typeof formBrand !== "object" || Array.isArray(formBrand)) return null;
    const o = formBrand as Record<string, unknown>;
    const source = o.brand_source;
    if (source === "inherit") return null;
    const explicit = source === "form";
    const accent = normalizeBrandColor(o.accent_color);
    return {
        display_name: normalizeBrandName(o.brand_name),
        accent_color: accent && (explicit || accent !== normalizeBrandColor(DEFAULT_FORM_ACCENT)) ? accent : null,
        // Forms historically accepted http(s); kept for compatibility on the form layer only.
        logo_url: normalizeBrandLogoUrl(o.logo_url, { allowHttp: true }),
        tour_cta_label: null,
    };
}

/** The form fields a publish freezes into the version. */
export function snapshotFormBrand(formMetadata: unknown): Record<string, unknown> {
    const o =
        formMetadata != null && typeof formMetadata === "object" && !Array.isArray(formMetadata)
            ? (formMetadata as Record<string, unknown>)
            : {};
    return {
        brand_source: o.brand_source === "inherit" || o.brand_source === "form" ? o.brand_source : null,
        brand_name: typeof o.brand_name === "string" ? o.brand_name : null,
        accent_color: typeof o.accent_color === "string" ? o.accent_color : null,
        logo_url: typeof o.logo_url === "string" ? o.logo_url : null,
        captured_at: new Date().toISOString(),
    };
}

export function resolveEffectivePublicBrand(layers: {
    form?: PublicBrandValues | null;
    location?: PublicBrandValues | null;
    organization?: PublicBrandValues | null;
}): EffectivePublicBrand {
    const order: [PublicBrandSource, PublicBrandValues | null | undefined][] = [
        ["form", layers.form],
        ["location", layers.location],
        ["organization", layers.organization],
    ];
    const pick = <K extends keyof PublicBrandValues>(key: K): [string | null, PublicBrandSource] => {
        for (const [source, values] of order) {
            const v = values?.[key];
            if (v) return [v, source];
        }
        return [null, "platform"];
    };
    const [displayName, nameSource] = pick("display_name");
    const [accent, accentSource] = pick("accent_color");
    const [logo, logoSource] = pick("logo_url");
    const [cta, ctaSource] = pick("tour_cta_label");
    return {
        displayName,
        accentColor: accent ?? PUBLIC_BRAND_PLATFORM_ACCENT,
        logoUrl: logo,
        tourCtaLabel: cta ?? PUBLIC_TOUR_CTA_DEFAULT,
        sources: { displayName: nameSource, accentColor: accentSource, logoUrl: logoSource, tourCtaLabel: ctaSource },
    };
}

// ── Contrast ─────────────────────────────────────────────────────────────────────────────────────

export const BRAND_INK_LIGHT = "#FFFFFF";
export const BRAND_INK_DARK = "#18273A";
export const BRAND_INK_BLACK = "#000000";
/** WCAG 2.x AA for normal-size text — the Director's floor for button labels. */
export const BRAND_TEXT_CONTRAST_MIN = 4.5;

function channel(value: number): number {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function rgb(hex: string): [number, number, number] {
    const raw = hex.replace("#", "");
    const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

/** WCAG 2.x relative luminance of a `#rgb` / `#rrggbb` colour. */
export function relativeLuminance(hex: string): number {
    const [r, g, b] = rgb(hex);
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
    const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
}

/**
 * Text on a surface painted in `accent`, at least 4.5:1: white if it holds, else the platform's dark
 * ink, else black. Black always clears 4.5:1 where white does not (the two meet near 4.58:1), so the
 * floor is guaranteed for every colour.
 */
export function brandOnAccent(accent: string): string {
    for (const ink of [BRAND_INK_LIGHT, BRAND_INK_DARK]) {
        if (contrastRatio(accent, ink) >= BRAND_TEXT_CONTRAST_MIN) return ink;
    }
    return BRAND_INK_BLACK;
}

/**
 * The accent as TEXT (links, labels, focus rings) on a white page, at least 4.5:1: the accent itself
 * when it is dark enough, otherwise the same hue darkened until it is — a pale yellow brand still
 * reads as that brand, not as invisible text.
 */
export function brandAccentInk(accent: string): string {
    if (contrastRatio(accent, BRAND_INK_LIGHT) >= BRAND_TEXT_CONTRAST_MIN) return normalizeBrandColor(accent) ?? accent;
    const [r, g, b] = rgb(accent);
    for (let f = 0.95; f > 0; f -= 0.05) {
        const hex = `#${[r, g, b].map((c) => Math.round(c * f).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
        if (contrastRatio(hex, BRAND_INK_LIGHT) >= BRAND_TEXT_CONTRAST_MIN) return hex;
    }
    return BRAND_INK_DARK;
}

/**
 * Below this, white text needs only a modest deepening of the brand to reach 4.5:1; above it the brand
 * is a light colour that reads best as a fill under dark text of its own hue.
 */
const BRAND_FILL_DEEPEN_FLOOR = 3;

export type BrandButtonColors = {
    /** The button surface: the brand itself, or the same hue deepened just enough. */
    fill: string;
    /** The label on that surface. Always at least 4.5:1 against `fill`. */
    ink: string;
    /** How the pair was chosen, for the operator preview's explanation. */
    treatment: "brand_light_text" | "deepened_brand_light_text" | "brand_dark_text";
};

function shade(hex: string, factor: number): string {
    const [r, g, b] = rgb(hex);
    return `#${[r, g, b].map((c) => Math.round(c * factor).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/**
 * A primary button for a brand colour (P1-B). The stored brand is never changed; only the pair is
 * derived, and the label always holds WCAG AA 4.5:1:
 *
 *   - white holds on the brand → the brand, white text;
 *   - a mid-tone brand (white at 3:1 or better) → the same hue deepened until white holds, white text
 *     (Bend Pine #00A283 → #00856B at 4.60:1, instead of near-black text on bright green);
 *   - a light brand (yellow, pastel) → the brand, with a deep shade of its own hue as the text.
 */
export function brandButtonColors(accent: string): BrandButtonColors {
    const brand = normalizeBrandColor(accent) ?? PUBLIC_BRAND_PLATFORM_ACCENT;
    if (contrastRatio(brand, BRAND_INK_LIGHT) >= BRAND_TEXT_CONTRAST_MIN) {
        return { fill: brand, ink: BRAND_INK_LIGHT, treatment: "brand_light_text" };
    }
    if (contrastRatio(brand, BRAND_INK_LIGHT) >= BRAND_FILL_DEEPEN_FLOOR) {
        for (let f = 0.98; f > 0.4; f -= 0.02) {
            const fill = shade(brand, f);
            if (contrastRatio(fill, BRAND_INK_LIGHT) >= BRAND_TEXT_CONTRAST_MIN) {
                return { fill, ink: BRAND_INK_LIGHT, treatment: "deepened_brand_light_text" };
            }
        }
    }
    for (let f = 0.45; f > 0; f -= 0.05) {
        const ink = shade(brand, f);
        if (contrastRatio(brand, ink) >= BRAND_TEXT_CONTRAST_MIN) return { fill: brand, ink, treatment: "brand_dark_text" };
    }
    return { fill: brand, ink: brandOnAccent(brand), treatment: "brand_dark_text" };
}
