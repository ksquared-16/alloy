/**
 * WHICH SUPABASE URL THE BROWSER SHOULD CALL — which is not always the one the
 * server was configured with.
 *
 * THE DEFECT. A lane's env sets `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421`
 * and `supabaseClient.ts` hands that absolute URL straight to
 * `createBrowserClient`. `NEXT_PUBLIC_*` means THE BROWSER resolves it. Loaded on
 * the execution host that is correct; loaded by a Director on
 * `https://vacilandos-mac-mini.tail2aa1af.ts.net:3012/login` it names the
 * DIRECTOR'S OWN LAPTOP, where nothing is listening. Sign-in could not succeed
 * for two independent reasons: the wrong machine, and plain http called from an
 * https page, which browsers block as active mixed content.
 *
 * That is why it looked inconsistent. The same lane worked from the host and
 * failed over the tailnet, because loopback is only true where the browser is.
 *
 * WHY NOT SIMPLY POINT THE ENV AT THE TAILNET. `publicAppUrl.isDeployedDatabaseTarget()`
 * classifies a NON-loopback Supabase URL as "this runtime writes to a real
 * deployed database", and that flag gates whether dispatch may really send to a
 * family — its own comment records eight delivered messages carrying loopback
 * links minted from slots. Repointing the env would flip every local lane to
 * deployed-database-target. That is a safety regression wearing a fix's clothes,
 * so the canonical URL is left exactly as it is.
 *
 * SO THE TRANSPORT MOVES, NOT THE IDENTITY. When the canonical URL is loopback,
 * the browser talks to the app's OWN origin under a proxy path and the Next
 * server — which really is on the host, where loopback is true — forwards it.
 * Whatever origin served the page is the origin that serves auth: localhost,
 * the tailnet, or anything added later. No port is published, and there is no
 * mixed content because the proxy inherits the page's scheme.
 *
 * HOSTED RUNTIMES ARE UNTOUCHED BY CONSTRUCTION. Every function here returns the
 * canonical value unchanged unless the URL is loopback, so production takes
 * today's code path exactly.
 */

/** The app-origin path the local Supabase is proxied under. */
export const LOCAL_SUPABASE_PROXY_PATH = "/supabase";

/**
 * The cookie/storage key used ONLY for loopback runtimes.
 *
 * `@supabase/ssr` derives the auth cookie name from the project URL, and
 * `auth-env.ts` already records the consequence: if the browser and middleware
 * disagree about the URL, they look for different `sb-*-auth-token` cookies and
 * middleware sees no user. Moving the browser's transport would do exactly that,
 * so the key is pinned to a constant and both clients are given the same one.
 * Local sessions are disposable, so a one-time change of cookie name costs a
 * re-login and nothing else.
 */
export const LOCAL_AUTH_COOKIE_NAME = "sb-alloy-local-auth";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

export function isLoopbackSupabaseUrl(raw?: string | null): boolean {
    const v = (raw ?? "").trim();
    if (!v) return false;
    try {
        return LOOPBACK_HOSTS.has(new URL(v).hostname.toLowerCase());
    } catch {
        return false;
    }
}

/**
 * The URL the browser client should be constructed with.
 *
 * `origin` is the page's own origin (`window.location.origin`), or null when
 * there is no browser — during SSR the canonical URL is already correct, because
 * the server is the host.
 */
export function browserSupabaseUrl(canonical: string, origin?: string | null): string {
    if (!isLoopbackSupabaseUrl(canonical)) return canonical;
    const o = (origin ?? "").trim().replace(/\/+$/, "");
    if (!o) return canonical;
    return `${o}${LOCAL_SUPABASE_PROXY_PATH}`;
}

/**
 * The pinned cookie name, or null to leave the library's own derivation alone.
 * Null for every hosted runtime — that is what keeps production identical.
 */
export function authCookieNameFor(canonical?: string | null): string | null {
    return isLoopbackSupabaseUrl(canonical) ? LOCAL_AUTH_COOKIE_NAME : null;
}

/** The rewrite a loopback runtime needs, or null when none applies. */
export function localSupabaseRewrite(canonical?: string | null): { source: string; destination: string } | null {
    if (!isLoopbackSupabaseUrl(canonical)) return null;
    const base = (canonical ?? "").trim().replace(/\/+$/, "");
    return { source: `${LOCAL_SUPABASE_PROXY_PATH}/:path*`, destination: `${base}/:path*` };
}
