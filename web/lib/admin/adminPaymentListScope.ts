/**
 * Narrow admin payment lists for dept/site-restricted roles when no explicit job filter is provided.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Payment IDs tied to scoped jobs via active allocations (direct job targets or charge-linked targets). */
export async function collectPaymentIdsLinkedViaAllocationsToScopedJobs(
    supabase: SupabaseClient,
    orgId: string,
    scopedJobIds: string[]
): Promise<string[]> {
    if (!scopedJobIds.length) return [];

    const out = new Set<string>();
    const BATCH = 200;

    for (let i = 0; i < scopedJobIds.length; i += BATCH) {
        const slice = scopedJobIds.slice(i, i + BATCH);

        const { data: jobTargets } = await supabase
            .from("payment_allocations")
            .select("payment_id")
            .eq("org_id", orgId)
            .eq("status", "active")
            .eq("target_entity_type", "job")
            .in("target_entity_id", slice);

        for (const r of jobTargets ?? []) {
            const pid = (r as { payment_id?: string }).payment_id;
            if (pid) out.add(pid);
        }

        const { data: charges } = await supabase.from("charges").select("id").eq("org_id", orgId).in("job_id", slice);

        const chargeIds = ((charges ?? []) as { id: string }[]).map((row) => row.id).filter(Boolean);

        for (let j = 0; j < chargeIds.length; j += BATCH) {
            const cslice = chargeIds.slice(j, j + BATCH);
            if (!cslice.length) continue;
            const { data: chargeAllocs } = await supabase
                .from("payment_allocations")
                .select("payment_id")
                .eq("org_id", orgId)
                .eq("status", "active")
                .in("charge_id", cslice);
            for (const r of chargeAllocs ?? []) {
                const pid = (r as { payment_id?: string }).payment_id;
                if (pid) out.add(pid);
            }
        }
    }

    return [...out];
}
