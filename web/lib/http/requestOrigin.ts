/**
 * THE ORIGIN A REDIRECT MUST POINT BACK AT — which is not the origin the server
 * thinks it is running on.
 *
 * THE DEFECT. `middleware.ts` built its login redirect as
 * `new URL("/login", request.url)`. Behind a reverse proxy, `request.url` is the
 * origin the Next server is BOUND to, not the one the browser used. A Director
 * on `https://vacilandos-mac-mini.tail2aa1af.ts.net:3011/workspace` was answered
 * `307 Location: https://localhost:3011/login` — their own machine, where
 * nothing is listening. Measured, not inferred: reproduced on three separate
 * lane runtimes, including two that predate this repair, so it is a property of
 * the redirect construction rather than of any one lane.
 *
 * Rewriting the `Host` header does not fix it, because Next normalises
 * `request.url` to the bound origin regardless of `Host`. The externally visible
 * origin has to be read from the forwarding headers the proxy actually sends.
 *
 * WHY THIS IS NOT `publicAppUrl`. That module is the authority for externally
 * DELIVERED links, and its first rule is that an origin must come from
 * configuration and "never from a request header" — precisely so a link in a
 * parent's inbox cannot be a function of whoever clicked send. That rule is
 * right, and this module does not weaken it.
 *
 * A redirect `Location` is the opposite case. It is consumed by the SAME browser
 * on the SAME request that just arrived, so the origin it already reached us on
 * is the only correct answer; a configured origin would send it somewhere else.
 * Delivered links keep asking `publicAppUrl`. Same-request redirects ask here,
 * and the two must not be collapsed.
 *
 * TRUSTING THE FORWARDED HEADERS IS BOUNDED. A spoofed `X-Forwarded-Host` can
 * only redirect the caller to a host they chose themselves; it never reaches
 * another user, is never persisted, and never authorises anything. The value is
 * still constrained to a plausible authority and a known scheme so nothing
 * header-shaped can be smuggled into a response header.
 */

/** The read side of `Headers` — kept structural so tests need no framework. */
export type HeaderLookup = { get(name: string): string | null | undefined };

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * A forwarded header may carry a comma-separated chain; the CLIENT-facing value
 * is the first entry. Anything the URL parser would not accept in an authority
 * is rejected rather than repaired, so a malformed header falls back instead of
 * producing a subtly wrong origin.
 */
function firstHeaderValue(headers: HeaderLookup, name: string): string | null {
    const raw = headers.get(name);
    if (typeof raw !== "string") return null;
    const first = raw.split(",")[0]?.trim() ?? "";
    return first.length ? first : null;
}

/**
 * Hostnames, IPv4, bracketed IPv6, and an optional port — nothing else. An
 * allowlist rather than a denylist, so no whitespace, control character,
 * userinfo, path or second scheme can reach a response header.
 */
const HOST_SHAPE = /^[A-Za-z0-9.\-\[\]:]+$/;

function validHost(host: string | null): string | null {
    if (!host) return null;
    if (!HOST_SHAPE.test(host)) return null;
    try {
        // Round-trip through the parser: only a host the URL spec accepts survives.
        return new URL(`https://${host}`).host || null;
    } catch {
        return null;
    }
}

function validProtocol(proto: string | null): string | null {
    if (!proto) return null;
    const p = proto.toLowerCase().replace(/:$/, "");
    return ALLOWED_PROTOCOLS.has(`${p}:`) ? `${p}:` : null;
}

/**
 * The origin this request is visible at from the caller's side.
 *
 * Precedence: `X-Forwarded-Proto`/`X-Forwarded-Host` (what a proxy states), then
 * the `Host` header, then the bound origin of `fallbackUrl`. Direct localhost
 * traffic sends no forwarding headers and therefore keeps resolving to
 * localhost, which is the correct answer there.
 */
export function externalRequestOrigin(headers: HeaderLookup, fallbackUrl: string): string {
    const fallback = new URL(fallbackUrl);

    const host =
        validHost(firstHeaderValue(headers, "x-forwarded-host")) ??
        validHost(firstHeaderValue(headers, "host")) ??
        fallback.host;

    const protocol =
        validProtocol(firstHeaderValue(headers, "x-forwarded-proto")) ?? fallback.protocol;

    return `${protocol}//${host}`;
}

/**
 * An absolute redirect target on the origin the caller actually used.
 *
 * `NextResponse.redirect` requires an absolute URL, which is what made
 * `request.url` the tempting base in the first place.
 */
export function externalRedirectUrl(
    request: { headers: HeaderLookup; url: string },
    pathAndQuery: string,
): URL {
    return new URL(pathAndQuery, externalRequestOrigin(request.headers, request.url));
}
