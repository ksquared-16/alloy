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

/** Request Origin header, or Origin derived from Referer. */
export function requestEmbedOrigin(request: NextRequest): string | null {
    const direct = normalizeOrigin(request.headers.get("origin"));
    if (direct) return direct;
    const ref = request.headers.get("referer");
    if (!ref) return null;
    try {
        const u = new URL(ref);
        return `${u.protocol}//${u.host}`;
    } catch {
        return null;
    }
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
