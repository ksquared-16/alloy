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

/**
 * If `allowed` is empty/null, all origins pass (embed + direct navigation).
 * Otherwise `requestOrigin` must exactly match one allowed entry (trimmed).
 */
export function isEmbedOriginAllowed(requestOrigin: string | null, allowed: string[] | null | undefined): boolean {
    if (!allowed || allowed.length === 0) return true;
    if (!requestOrigin) return false;
    const normAllowed = allowed.map((o) => o.trim()).filter(Boolean);
    return normAllowed.some((a) => a === requestOrigin);
}
