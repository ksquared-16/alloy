/**
 * Supabase client for client-side operations (browser).
 * Uses NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (same host as middleware
 * must use for auth cookie names — see lib/supabase/auth-env.ts).
 */

import { createBrowserClient } from "@supabase/ssr";

let authDebugListenerAttached = false;

export function createClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error(
            "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. These must be set in your environment."
        );
    }

    const client = createBrowserClient(supabaseUrl, supabaseAnonKey);

    if (typeof window !== "undefined" && !authDebugListenerAttached) {
        authDebugListenerAttached = true;
        client.auth.onAuthStateChange((event, session) => {
            console.log("[SupabaseBrowser DEBUG] onAuthStateChange", event, {
                hasSession: Boolean(session),
                userId: session?.user?.id ?? null,
            });
        });
    }

    return client;
}
