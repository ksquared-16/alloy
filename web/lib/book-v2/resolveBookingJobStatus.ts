import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve job_statuses row for book-v2 confirm: org-specific first, then org_id null, then any active row with that key.
 */
export async function resolveBookingJobStatus(
    supabase: SupabaseClient,
    orgId: string | null | undefined,
    preferredKeys: readonly string[]
): Promise<{ id: string; key: string } | null> {
    for (const raw of preferredKeys) {
        const k = String(raw ?? "").trim();
        if (!k) continue;

        if (orgId) {
            const { data } = await supabase
                .from("job_statuses")
                .select("id, key")
                .eq("org_id", orgId)
                .eq("key", k)
                .eq("is_active", true)
                .maybeSingle();
            const row = data as { id?: string; key?: string | null } | null;
            if (row?.id && row.key && String(row.key).trim()) {
                return { id: row.id, key: String(row.key).trim() };
            }
        }

        const { data: globalRow } = await supabase
            .from("job_statuses")
            .select("id, key")
            .is("org_id", null)
            .eq("key", k)
            .eq("is_active", true)
            .maybeSingle();
        const g = globalRow as { id?: string; key?: string | null } | null;
        if (g?.id && g.key && String(g.key).trim()) {
            return { id: g.id, key: String(g.key).trim() };
        }

        const { data: anyRow } = await supabase
            .from("job_statuses")
            .select("id, key")
            .eq("key", k)
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();
        const a = anyRow as { id?: string; key?: string | null } | null;
        if (a?.id && a.key && String(a.key).trim()) {
            return { id: a.id, key: String(a.key).trim() };
        }
    }
    return null;
}
