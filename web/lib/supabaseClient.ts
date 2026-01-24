/**
 * Supabase client for client-side operations (browser).
 * Uses client-accessible environment variables (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY).
 * Do NOT use server-only env vars here.
 */

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  // Client-only: Read NEXT_PUBLIC_* variables (accessible in browser)
  // These are inlined at build time by Next.js
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // Don't throw here - let the calling code handle the error
    // This prevents module-level errors that break the build
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. These must be set in your environment."
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

