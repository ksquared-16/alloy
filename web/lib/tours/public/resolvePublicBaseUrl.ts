/**
 * The public origin used to build no-login action URLs.
 *
 * Prefers the configured public app URL; falls back to the request's own origin so a
 * preview or certification host still produces links that work on that host. Never
 * hardcodes a domain.
 */
export function resolvePublicBaseUrl(request: { url?: string } | null | undefined): string {
    const configured = String(process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
    if (configured) return configured.replace(/\/+$/, "");
    try {
        const u = new URL(String(request?.url ?? ""));
        return `${u.protocol}//${u.host}`;
    } catch {
        return "";
    }
}
