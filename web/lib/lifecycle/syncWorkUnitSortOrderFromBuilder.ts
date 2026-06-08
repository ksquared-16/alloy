/**
 * After lifecycle builder stage reorder, sync work_units.sort_order from stage sort_order.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    activeLifecycleProcess,
    activeStagesForProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { lifecycleStageWorkUnitKey } from "@/lib/lifecycle/lifecycleStageWorkUnit";

export async function syncWorkUnitSortOrderFromBuilderStages(
    supabase: SupabaseClient,
    orgId: string,
    departmentId: string,
    metadata: Record<string, unknown>
): Promise<number> {
    const builder = lifecycleBuilderFromDepartmentMetadata(metadata);
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
