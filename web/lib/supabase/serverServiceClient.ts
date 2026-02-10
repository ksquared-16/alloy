/**
 * Supabase SERVICE ROLE client for server routes that must write on public flows
 * (e.g. quote-start, quote-refine, confirm) where the user is unauthenticated.
 * Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY only — no cookies/session.
 * Bypasses RLS so inserts/updates on contacts, customers, opportunities, jobs, schedules succeed.
 *
 * Use ONLY in API route handlers. Do not expose to client.
 *
 * Manual test checklist (public quote modal):
 * - Incognito → modal submit → should create contact + customer + opportunity every time (no 500).
 * - Re-submit same email/phone → reuse contact and customer; create/reuse quote opp; no dupes.
 */

import { createClient } from "@supabase/supabase-js";

function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) environment variable is not set");
  }
  return url;
}

function getServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set");
  }
  return key;
}

/**
 * Returns a Supabase client with service role. Use for all DB writes in public
 * booking flows (quote-start, quote-refine, confirm).
 */
export function createServiceRoleClient() {
  return createClient(getSupabaseUrl(), getServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
