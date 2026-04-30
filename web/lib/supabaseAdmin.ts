/**
 * Supabase admin client for server-side operations.
 * Uses service role key to bypass RLS for admin operations.
 * DO NOT use this in client components - only server components and route handlers.
 */

import { createClient } from "@supabase/supabase-js";

const getSupabaseUrl = (): string => {
    const url =
        (process.env.SUPABASE_URL?.trim() ||
            process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) ??
        "";
    if (!url) {
        throw new Error(
            "Supabase URL is not set. Set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL."
        );
    }
    return url;
};

const getSupabaseServiceRoleKey = (): string => {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) {
        console.error("[createAdminClient] missing service role key");
        throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set");
    }
    return key;
};

/**
 * Create a Supabase admin client with service role key (bypasses RLS)
 * Use this ONLY in server components and API routes
 */
export function createAdminClient() {
    return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}

