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
 * Default: ENABLED for the preview/config surface (it is inert — preview only —
 * and reads from its own isolated tables). Set the env var to "0"/"false" to
 * hide it entirely.
 */

function readFlag(raw: string | undefined, defaultValue: boolean): boolean {
    if (raw === undefined || raw === "") return defaultValue;
    const v = raw.trim().toLowerCase();
    if (v === "0" || v === "false" || v === "off" || v === "no") return false;
    if (v === "1" || v === "true" || v === "on" || v === "yes") return true;
    return defaultValue;
}

/** Server-side gate for Layout V2 preview/config APIs. */
export function isLayoutV2PreviewEnabledServer(): boolean {
    return readFlag(process.env.LAYOUT_V2_PREVIEW_ENABLED, true);
}

/** Client-side gate for the Layout V2 admin UI. */
export function isLayoutV2PreviewEnabledClient(): boolean {
    return readFlag(process.env.NEXT_PUBLIC_LAYOUT_V2_PREVIEW_ENABLED, true);
}
