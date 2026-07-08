/**
 * V1 form branding stored on form_definitions.description + metadata.
 * Not full tenant branding runtime — parent-facing preview only.
 */

export type ProcessingFormBranding = {
    brand_name: string;
    accent_color: string;
    logo_url: string | null;
    description: string;
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
    };
}
