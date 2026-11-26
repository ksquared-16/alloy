/**
 * Supabase client for client-side operations (browser).
 * Uses NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (same host as middleware
 * must use for auth cookie names — see lib/supabase/auth-env.ts).
 */

import { createBrowserClient } from "@supabase/ssr";

import { authCookieNameFor, browserSupabaseUrl } from "@/lib/supabase/browserTransport";
import { assertValidSupabaseHttpUrl } from "@/lib/supabase/supabaseUrlPolicy";

export function createClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error(
            "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. These must be set in your environment."
        );
    }

    assertValidSupabaseHttpUrl(supabaseUrl);

    const looksLikeSupabaseJwt = supabaseAnonKey.startsWith("eyJ");
    const looksLikeLocalPublishable = supabaseAnonKey.startsWith("sb_publishable_");
    const keyLooksPlaceholder =
        (!looksLikeSupabaseJwt && !looksLikeLocalPublishable) ||
        supabaseAnonKey.length < 80 ||
        /^your_/i.test(supabaseAnonKey) ||
        /anon_public_key/i.test(supabaseAnonKey);
    if (keyLooksPlaceholder) {
        throw new Error(
            "NEXT_PUBLIC_SUPABASE_ANON_KEY looks invalid or like a placeholder. Paste the full anon (public) key from Project Settings → API and restart `next dev`."
        );
    }

    /*
     * THE URL IS VALIDATED, THEN THE TRANSPORT IS CHOSEN.
     *
     * `supabaseUrl` stays the canonical identity — it is what the deployed-database
     * classifier reads and what the cookie name is pinned from. What changes is
     * where the browser SENDS the request: a loopback URL names the machine the
     * browser is on, which is the execution host only by luck. See browserTransport.
     */
    const origin = typeof window !== "undefined" ? window.location.origin : null;
    const target = browserSupabaseUrl(supabaseUrl, origin);
    const cookieName = authCookieNameFor(supabaseUrl);

    return createBrowserClient(
        target,
        supabaseAnonKey,
        cookieName ? { cookieOptions: { name: cookieName } } : undefined
    );
}
