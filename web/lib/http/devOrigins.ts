/**
 * WHICH BROWSER ORIGINS `next dev` LETS REACH `/_next/*` — including the HMR socket.
 *
 * THE DEFECT. Every local lane and candidate preview is published on the host's
 * tailnet name (`https://<host>.ts.net:<port>`) and records exactly that in
 * `NEXT_PUBLIC_APP_URL`. `allowedDevOrigins` named only loopback, so Next 16's
 * dev cross-site guard answered the browser's `/_next/webpack-hmr` upgrade with
 * 403 for an `Origin` on the tailnet name. The HMR client counts each failure,
 * retries (1 s ×5, then 5 s), and after `WEB_SOCKET_MAX_RECONNECTIONS` (12) calls
 * `location.reload()`. The counter starts again on the new page, so a Director on
 * the tailnet saw a full-page refresh roughly every 40–45 s, forever, while the
 * same page on localhost stayed put.
 *
 * THE CORRECTION IS ONE APPROVED HOST — NOT A WILDCARD, NOT "WHATEVER THE URL SAYS".
 * The operator approved exactly one tailnet hostname: this execution host. It is
 * added only when the runtime's configured public origin IS that host, and only
 * outside a production build (`allowedDevOrigins` is a dev-server setting — a
 * production server never reads it). Any other `*.ts.net` app URL adds nothing;
 * allowing another host needs its own approval and a change here.
 */

/** Always allowed: an operator on the execution host may use either spelling. */
export const LOOPBACK_DEV_ORIGINS: readonly string[] = ["127.0.0.1", "localhost"];

/** The ONE tailnet hostname approved for local dev live-update (operator decision, 2026-11-09). */
export const APPROVED_TAILNET_DEV_HOST = "vacilandos-mac-mini.tail2aa1af.ts.net";

/** The approved tailnet hostname when the configured app URL is on it; otherwise null. */
export function configuredTailnetDevHost(appUrl?: string | null): string | null {
    const raw = (appUrl ?? "").trim();
    if (!raw) return null;
    try {
        const url = new URL(raw);
        if (url.protocol !== "https:" && url.protocol !== "http:") return null;
        return url.hostname.toLowerCase() === APPROVED_TAILNET_DEV_HOST ? APPROVED_TAILNET_DEV_HOST : null;
    } catch {
        return null;
    }
}

export function allowedDevOriginsFor({
    appUrl,
    nodeEnv,
}: {
    appUrl?: string | null;
    nodeEnv?: string | null;
}): string[] {
    const origins = [...LOOPBACK_DEV_ORIGINS];
    if (nodeEnv === "production") return origins;
    const tailnet = configuredTailnetDevHost(appUrl);
    if (tailnet && !origins.includes(tailnet)) origins.push(tailnet);
    return origins;
}
