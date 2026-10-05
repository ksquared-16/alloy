/**
 * THE ORGANISATION'S BUSINESS DATE — one Financials answer to "what day is it for this tenant".
 *
 * ── WHY UTC DATE-SLICING IS NOT THIS ─────────────────────────────────────────────────────────
 *
 * `new Date().toISOString().slice(0, 10)` is the UTC calendar date. For an organisation west of
 * UTC it becomes TOMORROW partway through the local working afternoon — 17:00 in Los Angeles is
 * already the next UTC day. Everywhere Financials means "today for this organisation", that idiom
 * silently dates money a day forward for part of every day.
 *
 * The S3/S4 real-clock certification already proved these are different facts rather than
 * equivalent spellings: the close scheduler woke at 04:00 UTC, computed the org's business date,
 * and correctly DECLINED to close a period that the UTC date said had finished. The same
 * distinction applies to an effective date, a service date, and the date a correction was decided.
 *
 * ── WHAT THIS DOES AND DOES NOT OWN ──────────────────────────────────────────────────────────
 *
 * It owns nothing but the formatting. The timezone comes from `fetchOperationalTimezoneForOrg` —
 * the same operational calendar authority commercial close uses — and the conversion is
 * `formatInTimeZone`, the library already used for org-local day bounds. No timezone arithmetic is
 * written here, and none is written in React: a surface receives the resolved date from the server
 * rather than computing one from the browser's own clock, because the browser's zone is the
 * OPERATOR's and the economic date is the ORGANISATION's, and those are not the same question.
 *
 * ── WHAT STAYS UTC ───────────────────────────────────────────────────────────────────────────
 *
 * Date ARITHMETIC on an already-chosen YMD stays UTC-anchored and should: `2026-11-30` plus ten
 * days is `2026-12-10` in every zone, and anchoring that at UTC midnight is how it stays stable.
 * Only the question "which day is it NOW" needs a zone.
 */
import { formatInTimeZone } from "date-fns-tz";
import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchOrgTimeZoneIana } from "@/lib/admin/orgLocalDayBounds";

/**
 * The calendar date `at` falls on, in `timeZone`. Pure, so a caller that already holds the zone —
 * or a test proving a day boundary — needs no database.
 */
export function businessDateInZone(timeZone: string, at: Date = new Date()): string {
    return formatInTimeZone(at, timeZone, "yyyy-MM-dd");
}

/**
 * The organisation's current business date.
 *
 * A failure to read the zone is NOT silently treated as UTC: `fetchOperationalTimezoneForOrg`
 * already resolves to a usable zone (falling back to UTC when a tenant has configured none), so
 * this has one answer rather than a hidden second behaviour on the error path.
 */
export async function fetchOrgBusinessDate(
    supabase: SupabaseClient,
    orgId: string,
    at: Date = new Date(),
): Promise<string> {
    const zone = await fetchOrgTimeZoneIana(supabase, orgId);
    return businessDateInZone(zone, at);
}
