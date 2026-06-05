/**
 * Layout V2 — feature flag.
 *
 * Layout V2 is a FOUNDATION sprint with NO runtime adoption. This flag exists so
 * the config/preview surface can be hidden by default and, later, so the live
 * renderers can branch on it during the adoption sprint. While off, no live
 * drawer, queue, or workspace behavior changes in any way.
 *
 * Server: LAYOUT_V2_PREVIEW_ENABLED.
 * Client: NEXT_PUBLIC_LAYOUT_V2_PREVIEW_ENABLED (for the admin UI gate).
 *
 * Default: DISABLED. This is an un-adopted foundation; the preview/config
 * surface stays inert until explicitly enabled (and the entity_layouts
 * migration has been applied). When off, the API routes return 404 and the
 * admin page shows a disabled notice — so an un-migrated or isolated deploy is
 * inert by default. Set the env var to "1"/"true" to turn it on.
 */

function readFlag(raw: string | undefined, defaultValue: boolean): boolean {
    if (raw === undefined || raw === "") return defaultValue;
    const v = raw.trim().toLowerCase();
    if (v === "0" || v === "false" || v === "off" || v === "no") return false;
    if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
    return defaultValue;
}

/** Server-side gate for Layout V2 preview/config APIs. Default: off. */
export function isLayoutV2PreviewEnabledServer(): boolean {
    return readFlag(process.env.LAYOUT_V2_PREVIEW_ENABLED, false);
}

/** Client-side gate for the Layout V2 admin UI. Default: off. */
export function isLayoutV2PreviewEnabledClient(): boolean {
    return readFlag(process.env.NEXT_PUBLIC_LAYOUT_V2_PREVIEW_ENABLED, false);
}
