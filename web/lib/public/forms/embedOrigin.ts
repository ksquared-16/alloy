import type { NextRequest } from "next/server";

function normalizeOrigin(raw: string | null): string | null {
    if (!raw?.trim()) return null;
    const s = raw.trim();
    try {
        if (s.startsWith("http://") || s.startsWith("https://")) {
            const u = new URL(s);
            return `${u.protocol}//${u.host}`;
        }
    } catch {
        return null;
    }
    return null;
}

/**
 * Origin header, or Origin derived from Referer.
 *
 * Header-based so the same rule can be applied from a route handler AND from the embed page's
 * server render — an iframe document navigation sends no Origin but does send Referer.
 */
export function embedOriginFromHeaders(getHeader: (name: string) => string | null): string | null {
    const direct = normalizeOrigin(getHeader("origin"));
    if (direct) return direct;
    const ref = getHeader("referer");
    if (!ref) return null;
    try {
        const u = new URL(ref);
        return `${u.protocol}//${u.host}`;
    } catch {
        return null;
    }
}

/** Request Origin header, or Origin derived from Referer. */
export function requestEmbedOrigin(request: NextRequest): string | null {
    return embedOriginFromHeaders((name) => request.headers.get(name));
}

/** Normalize stored allowlist entries (e.g. `https://host/path` → `https://host`). */
export function normalizeEmbedAllowlistEntry(entry: string): string {
    const t = entry.trim();
    if (!t) return t;
    try {
        if (t.startsWith("http://") || t.startsWith("https://")) {
            const u = new URL(t);
            return `${u.protocol}//${u.host}`;
        }
    } catch {
        /* fall through */
    }
    return t;
}

/**
 * If `allowed` is empty/null, all origins pass (embed + direct navigation).
 * Otherwise `requestOrigin` must match one entry after normalization.
 */
export function isEmbedOriginAllowed(requestOrigin: string | null, allowed: string[] | null | undefined): boolean {
    if (!allowed || allowed.length === 0) return true;
    if (!requestOrigin) return false;
    const normAllowed = allowed.map(normalizeEmbedAllowlistEntry).filter(Boolean);
    return normAllowed.some((a) => a === requestOrigin);
}
