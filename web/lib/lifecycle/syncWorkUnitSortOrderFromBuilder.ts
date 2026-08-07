/**
 * After a lifecycle-builder stage reorder, sync work_units.sort_order from stage sort_order.
 *
 * TAKES THE BUILDER IT SHOULD ORDER BY, rather than reading one.
 *
 * It used to accept `departments.metadata` and derive the builder from it. That metadata is the
 * PUBLISHED PROJECTION, so a reorder saved to the draft synchronized Work Unit order from whatever
 * was last published — stale by exactly the change the operator had just made, and wrong for any
 * department with an unpublished reorder. The authority for "what order did the operator just
 * save?" is the saved draft, and nothing else.
 *
 * Passing the builder in also removes the possibility of the caller and this function disagreeing
 * about where configuration comes from: there is now only one place that decision is made.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    activeLifecycleProcess,
    activeStagesForProcess,
    type LifecycleBuilderV1,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { lifecycleStageWorkUnitKey } from "@/lib/lifecycle/lifecycleStageWorkUnit";

export async function syncWorkUnitSortOrderFromBuilderStages(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string,
    /** The authoritative builder — normally the draft that was just saved. Never the projection. */
    builder: LifecycleBuilderV1 | null
): Promise<number> {
    const process = builder ? activeLifecycleProcess(builder) : null;
    if (!process) return 0;

    const stages = activeStagesForProcess(process);
    const now = new Date().toISOString();
    let updated = 0;

    for (const stage of stages) {
        const stageKey = stage.key.trim();
        if (!stageKey) continue;
        const wuKey = lifecycleStageWorkUnitKey(stageKey);
        const { data: row } = await supabase
            .from("work_units")
            .select("id")
            .eq("org_id", orgId)
            .eq("department_id", departmentId)
            .eq("key", wuKey)
            .eq("is_active", true)
            .maybeSingle();
        if (!row) continue;
        const { error } = await supabase
            .from("work_units")
            .update({ sort_order: stage.sort_order, updated_at: now })
            .eq("id", (row as { id: string }).id)
            .eq("org_id", orgId);
        if (!error) updated += 1;
    }

    return updated;
}
