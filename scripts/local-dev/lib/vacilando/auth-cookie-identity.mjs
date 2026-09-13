/**
 * ONE RULE FOR WHICH AUTH COOKIE A RUNTIME USES.
 *
 * THE DEFECT THIS CLOSES. The application pins a constant for loopback runtimes
 * — `web/lib/supabase/browserTransport.ts`:
 *
 *     export function authCookieNameFor(canonical) {
 *       return isLoopbackSupabaseUrl(canonical) ? LOCAL_AUTH_COOKIE_NAME : null;
 *     }
 *
 * `vac-qa-session-mint.mjs` never asked that question. It derived the name from
 * the project ref unconditionally:
 *
 *     const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
 *     const cookieName = `sb-${projectRef}-auth-token`;
 *
 * Against the certification project at 127.0.0.1:54421 the ref is "127", so the
 * mint wrote `sb-127-auth-token` while the running app read `sb-alloy-local-auth`.
 * MEASURED A/B with the same session value: `sb-127-auth-token` → 307 /login,
 * `sb-alloy-local-auth` → 200 authenticated. The session was always valid. It
 * was filed under a name nothing was looking for.
 *
 * WHY THIS FILE EXISTS RATHER THAN A SECOND CONSTANT. Two implementations of
 * one rule drift the first time either moves, and that is exactly what happened.
 * The app cannot import this (it is TypeScript, bundled), and this cannot import
 * the app. So the rule lives here once, and a structural control parses
 * `browserTransport.ts` and fails if the two ever disagree — about the constant,
 * about the loopback host set, or about the hosted fallback.
 *
 * THE HOSTED PATH IS UNCHANGED AND MUST STAY THAT WAY. A non-loopback runtime
 * still gets the library's own `sb-<ref>-auth-token`, because production
 * behaviour is not this repair's to alter.
 */

/** Hosts the application treats as a loopback Supabase runtime. */
export const LOOPBACK_HOSTS = Object.freeze(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

/** The pinned cookie name for loopback runtimes. Mirrors LOCAL_AUTH_COOKIE_NAME. */
export const LOCAL_AUTH_COOKIE_NAME = "sb-alloy-local-auth";

export function isLoopbackSupabaseUrl(raw) {
  const v = String(raw ?? "").trim();
  if (!v) return false;
  try {
    return LOOPBACK_HOSTS.includes(new URL(v).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * The cookie name a session for this Supabase URL must be written under.
 *
 * Loopback → the pinned local name, because that is what the running app reads.
 * Hosted   → the library's derivation from the project ref, unchanged.
 *
 * Never returns null: a caller writing a cookie needs a name, and "let the
 * library decide" is not available outside the library.
 */
export function authCookieNameForUrl(supabaseUrl) {
  if (isLoopbackSupabaseUrl(supabaseUrl)) return LOCAL_AUTH_COOKIE_NAME;
  const ref = projectRefFor(supabaseUrl);
  return ref ? `sb-${ref}-auth-token` : null;
}

/** The project ref the hosted derivation uses. Exported so controls can state both halves. */
export function projectRefFor(supabaseUrl) {
  try {
    return new URL(String(supabaseUrl ?? "")).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}
