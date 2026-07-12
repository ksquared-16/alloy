/**
 * Supabase client for client-side operations (browser).
 * Uses NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (same host as middleware
 * must use for auth cookie names — see lib/supabase/auth-env.ts).
 */

import { createBrowserClient } from "@supabase/ssr";

function assertValidSupabaseHttpUrl(supabaseUrl: string): void {
    let u: URL;
    try {
        u = new URL(supabaseUrl);
    } catch {
        throw new Error(
            "NEXT_PUBLIC_SUPABASE_URL is not a valid URL. Use https://<project-ref>.supabase.co from Project Settings → API."
        );
    }
    if (u.protocol !== "https:") {
        const allowLocalCert =
            process.env.PROCESSING_LOCAL_CERT_ALLOW_HTTP === "true" &&
            (u.hostname === "127.0.0.1" || u.hostname === "localhost") &&
            u.port === "55321";
        if (!allowLocalCert) {
            throw new Error(
                "NEXT_PUBLIC_SUPABASE_URL must use https. Fix your .env.local and restart `next dev`."
            );
        }
    }
    if (!u.hostname || u.hostname.includes(" ")) {
        throw new Error(
            "NEXT_PUBLIC_SUPABASE_URL has an invalid hostname. Check for typos, quotes, or whitespace in .env.local."
        );
    }
    const lower = supabaseUrl.toLowerCase();
    if (
        lower.includes("your_project_ref") ||
        lower.includes("placeholder") ||
        lower.includes("example.supabase.co")
    ) {
        throw new Error(
            "NEXT_PUBLIC_SUPABASE_URL still looks like a placeholder. Set the real project URL from Supabase Dashboard → Project Settings → API."
        );
    }
}

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
