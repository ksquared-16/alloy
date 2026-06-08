/**
 * Safe, non-secret metadata about public Supabase auth env (client bundle only).
 * Used for local debugging; do not log key material.
 */

export type PublicSupabaseAuthDebug = {
  urlDefined: boolean;
  anonKeyDefined: boolean;
  hostname: string | null;
  scheme: string | null;
  urlParseError: string | null;
  /** Auth HTTP path + query used by password sign-in (hostname comes from URL). */
  expectedAuthTokenPath: string;
};

const AUTH_TOKEN_PATH = "/auth/v1/token?grant_type=password";

export function getPublicSupabaseAuthDebug(): PublicSupabaseAuthDebug {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

  let hostname: string | null = null;
  let scheme: string | null = null;
  let urlParseError: string | null = null;

  if (rawUrl) {
    try {
      const u = new URL(rawUrl);
      hostname = u.hostname;
      scheme = u.protocol.replace(":", "") || null;
    } catch (e) {
      urlParseError = e instanceof Error ? e.message : "Invalid URL";
    }
  }

  return {
    urlDefined: Boolean(rawUrl),
    anonKeyDefined: Boolean(rawKey),
    hostname,
    scheme,
    urlParseError,
    expectedAuthTokenPath: AUTH_TOKEN_PATH,
  };
}
