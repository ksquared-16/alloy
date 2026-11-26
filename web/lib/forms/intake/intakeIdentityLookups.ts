/**
 * POS-FP8a — shared, read-only person identity lookups.
 *
 * Extracted verbatim from `applyFormIntakeSafe` so the legacy intake auto path and
 * the new non-mutating recommendation resolver use ONE implementation (parity, no
 * duplication). These are pure reads — they never write.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { phoneLookupVariantsCompat as phoneLookupVariants } from "@/lib/identity";

export async function listPersonIdsByEmail(
    supabase: SupabaseClient,
    orgId: string,
    emailNorm: string
): Promise<string[]> {
    const { data, error } = await supabase.from("persons").select("id").eq("org_id", orgId).ilike("email", emailNorm);
    if (error) throw new Error(error.message);
    const ids = (data ?? []).map((r: { id: string }) => r.id).filter(Boolean);
    return [...new Set(ids)];
}

export async function listPersonIdsByPhone(
    supabase: SupabaseClient,
    orgId: string,
    phoneNorm: string
): Promise<string[]> {
    const variants = phoneLookupVariants(phoneNorm);
    const { data, error } = await supabase.from("persons").select("id").eq("org_id", orgId).in("phone", variants);
    if (error) throw new Error(error.message);
    const ids = (data ?? []).map((r: { id: string }) => r.id).filter(Boolean);
    return [...new Set(ids)];
}

/** Read-only display labels for candidate person ids (name, else email, else id). */
export async function getPersonLabels(
    supabase: SupabaseClient,
    orgId: string,
    ids: string[]
): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (ids.length === 0) return out;
    const { data, error } = await supabase
        .from("persons")
        .select("id, first_name, last_name, email")
        .eq("org_id", orgId)
        .in("id", ids);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as { id: string; first_name?: string | null; last_name?: string | null; email?: string | null }[]) {
        const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
        out.set(r.id, name || r.email || r.id);
    }
    return out;
}
