/**
 * Canonical public origin for links in SMS/email (no trailing slash).
 *
 * Precedence:
 * 1. NEXT_PUBLIC_APP_URL — set per environment to your branded domain (e.g. https://app.example.com).
 * 2. APP_CANONICAL_URL or ALLOY_PUBLIC_APP_URL — server-only fallbacks if the public var is unset.
 * 3. VERCEL_PROJECT_PRODUCTION_URL — Vercel’s production hostname (avoids *.vercel.app preview URLs in links).
 * 4. VERCEL_URL — last resort (preview deployment host).
 */
function trimEnv(v: string | undefined | null): string {
    return v != null ? String(v).trim() : "";
}

export function getPublicAppOrigin(): string {
    const fromEnv =
        trimEnv(process.env.NEXT_PUBLIC_APP_URL) ||
        trimEnv(process.env.APP_CANONICAL_URL) ||
        trimEnv(process.env.ALLOY_PUBLIC_APP_URL);
    if (fromEnv) return fromEnv.replace(/\/$/, "");

    const prodHost = trimEnv(process.env.VERCEL_PROJECT_PRODUCTION_URL);
    if (prodHost) {
        const host = prodHost.replace(/^https?:\/\//i, "").split("/")[0] ?? prodHost;
        return `https://${host.replace(/\/$/, "")}`;
    }

    const vercel = trimEnv(process.env.VERCEL_URL);
    if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

    return "";
}
