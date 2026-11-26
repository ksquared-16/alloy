/**
 * Safe, non-secret metadata about public Supabase auth env (client bundle only).
 * Used for local debugging; do not log key material.
 *
 * ONE SOURCE OF TRUTH. Every endpoint reported here is derived from a single
 * parsed `NEXT_PUBLIC_SUPABASE_URL`, never reassembled from parts.
 *
 * The login page previously rendered `https://${hostname}${path}`. Both halves
 * were wrong: the scheme was a hardcoded literal, and `URL.hostname` excludes
 * the port. Against the local certification stack that turned a healthy
 * `http://127.0.0.1:54421` into a fictional `https://127.0.0.1/auth/v1/token`,
 * which reads exactly like a scheme-upgrade-and-port-drop bug in the auth
 * client. It is not — `createClient()` hands the URL to `createBrowserClient`
 * untouched — but a diagnostic that invents an endpoint is worse than none: it
 * sent a certification run hunting a defect that was never in the request path.
 *
 * `URL.origin` is what carries scheme + host + explicit port together. Nothing
 * here may build a URL from `hostname` or assume a scheme.
 */

export type PublicSupabaseAuthDebug = {
  urlDefined: boolean;
  anonKeyDefined: boolean;
  /** Scheme + host + explicit port, exactly as configured. Null when unset/unparsable. */
  origin: string | null;
  hostname: string | null;
  scheme: string | null;
  /** Explicit port, or null when the URL relies on the scheme default. */
  port: string | null;
  urlParseError: string | null;
  /** Auth HTTP path + query used by password sign-in. */
  expectedAuthTokenPath: string;
  /**
   * The complete URL password sign-in posts to. Display this — never
   * reconstruct it from `scheme`/`hostname`/`port`.
   */
  authTokenUrl: string | null;
};

const AUTH_TOKEN_PATH = "/auth/v1/token?grant_type=password";

export function getPublicSupabaseAuthDebug(): PublicSupabaseAuthDebug {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

  let origin: string | null = null;
  let hostname: string | null = null;
  let scheme: string | null = null;
  let port: string | null = null;
  let authTokenUrl: string | null = null;
  let urlParseError: string | null = null;

  if (rawUrl) {
    try {
      const u = new URL(rawUrl);
      origin = u.origin;
      hostname = u.hostname;
      scheme = u.protocol.replace(":", "") || null;
      port = u.port || null;
      // Resolved against the parsed origin, so scheme and explicit port survive.
      authTokenUrl = new URL(AUTH_TOKEN_PATH, u.origin).toString();
    } catch (e) {
      urlParseError = e instanceof Error ? e.message : "Invalid URL";
    }
  }

  return {
    urlDefined: Boolean(rawUrl),
    anonKeyDefined: Boolean(rawKey),
    origin,
    hostname,
    scheme,
    port,
    urlParseError,
    expectedAuthTokenPath: AUTH_TOKEN_PATH,
    authTokenUrl,
  };
}
