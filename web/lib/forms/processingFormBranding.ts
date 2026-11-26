/**
 * V1 form branding stored on form_definitions.description + metadata.
 * Not full tenant branding runtime — parent-facing preview only.
 */

export type ProcessingFormBranding = {
    brand_name: string;
    accent_color: string;
    logo_url: string | null;
    description: string;
    /**
     * "inherit" = the public form shows the school's brand (location → organization); "form" = these
     * values override it. Absent on forms saved before S4 (see lib/branding/publicBrand.ts).
     */
    brand_source?: "inherit" | "form" | null;
};

export const DEFAULT_FORM_ACCENT = "#00A283";

export function parseFormBranding(
    form: { description?: string | null; metadata?: Record<string, unknown> } | null | undefined
): ProcessingFormBranding {
    const meta = form?.metadata ?? {};
    const descFromMeta = typeof meta.description === "string" ? meta.description.trim() : "";
    const descFromRow = typeof form?.description === "string" ? form.description.trim() : "";
    return {
        brand_name: typeof meta.brand_name === "string" ? meta.brand_name.trim() : "",
        accent_color:
            typeof meta.accent_color === "string" && /^#[0-9A-Fa-f]{6}$/.test(meta.accent_color)
                ? meta.accent_color
                : DEFAULT_FORM_ACCENT,
        logo_url: typeof meta.logo_url === "string" && meta.logo_url.trim() ? meta.logo_url.trim() : null,
        description: descFromRow || descFromMeta,
        brand_source: meta.brand_source === "inherit" || meta.brand_source === "form" ? meta.brand_source : null,
    };
}

export function brandingMetadataPatch(
    branding: ProcessingFormBranding,
    existing: Record<string, unknown> = {}
): Record<string, unknown> {
    return {
        ...existing,
        brand_name: branding.brand_name.trim() || null,
        accent_color: branding.accent_color || DEFAULT_FORM_ACCENT,
        logo_url: branding.logo_url?.trim() || null,
        ...(branding.brand_source ? { brand_source: branding.brand_source } : {}),
    };
}

/**
 * The monogram a branded header shows when no logo is configured: the initials of the school's
 * name ("Lil' Sunshine Childcare" → "LS"), never the first letters of a placeholder. Without a
 * configured name there is nothing to abbreviate — "Your school" became an unexplained "YO".
 */
export function brandMonogram(brandName: string | null | undefined): string {
    const words = (brandName ?? "")
        .replace(/['’]/g, "")
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean);
    // Connective words carry no identity: "School of Enrichment" → "SE".
    const significant = words.filter((w) => !["of", "the", "and", "for", "at"].includes(w.toLowerCase()));
    if (significant.length) words.splice(0, words.length, ...significant);
    if (!words.length) return "";
    if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
    return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

