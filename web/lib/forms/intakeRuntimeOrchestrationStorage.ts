/** Client-only session helpers for active runtime link + embed URL (IC-5.7). */

const ACTIVE_RUNTIME_KEY = (formId: string) => `alloy_form_active_runtime_link:${formId}`;
const LINK_EMBED_KEY = (linkId: string) => `alloy_form_link_embed:${linkId}`;

export function readActiveRuntimeLinkId(formId: string): string | null {
    if (typeof window === "undefined") return null;
    try {
        return sessionStorage.getItem(ACTIVE_RUNTIME_KEY(formId));
    } catch {
        return null;
    }
}

export function writeActiveRuntimeLinkId(formId: string, linkId: string): void {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.setItem(ACTIVE_RUNTIME_KEY(formId), linkId);
    } catch {
        /* ignore */
    }
}

export function readLinkEmbedUrl(linkId: string): string | null {
    if (typeof window === "undefined") return null;
    try {
        return sessionStorage.getItem(LINK_EMBED_KEY(linkId));
    } catch {
        return null;
    }
}

export function writeLinkEmbedUrl(linkId: string, embedUrl: string): void {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.setItem(LINK_EMBED_KEY(linkId), embedUrl);
    } catch {
        /* ignore */
    }
}
