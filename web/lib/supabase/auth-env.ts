/**
 * Supabase Auth cookie names are derived from the project URL host.
 * The browser client can only use NEXT_PUBLIC_SUPABASE_URL — so middleware and
 * server RSC clients MUST use the same URL (prefer NEXT_PUBLIC_*) or they will
 * look for cookies under a different `sb-*-auth-token` prefix and see "no user".
 */

export function getSupabaseUrlForAuth(): string | undefined {
    const pub = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const srv = process.env.SUPABASE_URL?.trim();
    return pub || srv;
}

export function getSupabaseAnonKeyForAuth(): string | undefined {
    const pub = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    const srv = process.env.SUPABASE_ANON_KEY?.trim();
    return pub || srv;
}

/** One-shot warning when both URLs are set but differ (common staging misconfig). */
export function warnIfAuthSupabaseUrlMismatch(): void {
    const pub = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const srv = process.env.SUPABASE_URL?.trim();
    if (pub && srv && pub !== srv) {
        console.warn(
            "[supabase auth-env] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_URL differ. Auth cookies are keyed from the URL the browser uses (NEXT_PUBLIC_*). Middleware/server auth should prefer NEXT_PUBLIC_* — see getSupabaseUrlForAuth()."
        );
    }
}
