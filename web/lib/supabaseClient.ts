/**
 * Supabase client for client-side operations (browser).
 * Uses NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (same host as middleware
 * must use for auth cookie names — see lib/supabase/auth-env.ts).
 */

import { createBrowserClient } from "@supabase/ssr";

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

    return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
