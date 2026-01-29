/**
 * Supabase admin client for server-side operations.
 * Uses service role key to bypass RLS for admin operations.
 * DO NOT use this in client components - only server components and route handlers.
 */

import { createClient } from "@supabase/supabase-js";

const getSupabaseUrl = (): string => {
    const url = process.env.SUPABASE_URL;
    if (!url) {
        throw new Error("SUPABASE_URL environment variable is not set");
    }
    return url;
};

const getSupabaseServiceRoleKey = (): string => {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) {
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

