import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveJobStatusRowByOrgAndKey } from "@/lib/admin/jobEffectiveStatusKey";

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
        const row = await resolveJobStatusRowByOrgAndKey(supabase, orgId, k);
        if (row) return row;
    }
    return null;
}
