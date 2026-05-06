/**
 * Admin "preview public form" UX — uses the same public embed URL and renderer as recipients.
 * Preview mints a normal `form_public_links` row (via POST public-links) with metadata flags;
 * plaintext tokens are never recovered from existing rows.
 */

/** Merged into POST body `metadata` when creating a preview link. */
export const ADMIN_PREVIEW_LINK_METADATA = {
    alloy_admin_preview: true,
} as const;

export const ADMIN_PREVIEW_LINK_LABEL = "Admin preview" as const;

export function previewEmbedSessionStorageKey(formDefinitionId: string): string {
    return `alloy_admin_form_preview_embed:${formDefinitionId}`;
}

/** Append `preview=1` for optional banner on `/forms/embed/[token]`. */
export function appendPreviewQueryToPath(embedPath: string): string {
    const sep = embedPath.includes("?") ? "&" : "?";
    return `${embedPath}${sep}preview=1`;
}

/** Append `preview=1` to an absolute embed URL. */
export function appendPreviewQueryToFullUrl(fullUrl: string): string {
    try {
        const u = new URL(fullUrl);
        u.searchParams.set("preview", "1");
        return u.toString();
    } catch {
        return fullUrl;
    }
}

export function buildPreviewEmbedUrl(origin: string, embedPath: string): string {
    const base = origin.replace(/\/$/, "");
    return `${base}${appendPreviewQueryToPath(embedPath)}`;
}
