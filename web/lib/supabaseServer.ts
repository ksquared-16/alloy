/**
 * Supabase client for server-side operations (middleware, server components).
 * Uses the same URL/key priority as the browser for auth cookies (NEXT_PUBLIC_* first).
 * Do NOT use this in client components.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAnonKeyForAuth, getSupabaseUrlForAuth } from "@/lib/supabase/auth-env";
import { authCookieNameFor } from "@/lib/supabase/browserTransport";

export async function createClient() {
  const cookieStore = await cookies();

  const supabaseUrl = getSupabaseUrlForAuth();
  const supabaseAnonKey = getSupabaseAnonKeyForAuth();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables. Required: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_URL and SUPABASE_ANON_KEY)"
    );
  }

  /*
   * The browser may reach Supabase through the app's own origin on a loopback
   * runtime, which would otherwise change the cookie name it derives and leave
   * middleware looking for a cookie nobody set. Both sides are pinned to the same
   * name; null on hosted runtimes, so production keeps the library default.
   */
  const cookieName = authCookieNameFor(supabaseUrl);

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    ...(cookieName ? { cookieOptions: { name: cookieName } } : {}),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  });
}

