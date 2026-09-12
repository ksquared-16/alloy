/**
 * WHICH STAGES LIVE RECORDS ARE ACTUALLY SITTING ON.
 *
 * Configuration can prove that a track model is internally coherent. It cannot prove that adopting
 * it is safe, because safety depends on data: a stage the configuration forgot is harmless while
 * nothing is standing on it and destructive the moment something is. After adoption every lane is
 * resolved from track membership, so an instance parked on a stage that belongs to no track stops
 * resolving — it does not error, it simply stops appearing, which is the worst way for a
 * configuration change to fail.
 *
 * Read as its own function so the adoption evaluator can stay pure: the caller fetches, the
 * evaluator judges, and the judgement is testable without a database.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type ObservedInstanceStages = {
    stage_keys: string[];
    /** How many running instances were examined — 0 makes an empty stage list meaningful. */
    instance_count: number;
};

const PAGE = 1000;

/**
 * Distinct stage keys of the process's still-running instances.
 *
 * `close_reason_key IS NULL` is the running set. A closed instance is history: it resolves through
 * nothing and routes nowhere, so a stage that only closed records occupy must not block adoption.
 *
 * Paged explicitly because PostgREST silently caps a request at 1000 rows, and a tenant with more
 * running instances than that would otherwise hand back a stage list that merely looked complete.
 */
export async function observedProcessInstanceStages(
    supabase: SupabaseClient,
    params: { orgId: string; processKey: string },
): Promise<ObservedInstanceStages> {
    const stageKeys = new Set<string>();
    let instanceCount = 0;

    for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
            .from("process_instances")
            .select("id, stage_key")
            .eq("org_id", params.orgId)
            .eq("process_key", params.processKey)
            .is("close_reason_key", null)
            // A stable unique tiebreaker: without it a paged read can repeat or skip rows.
            .order("id", { ascending: true })
            .range(from, from + PAGE - 1);

        if (error) throw new Error(`Could not read process instances: ${error.message}`);
        const rows = (data ?? []) as { id: string; stage_key: string | null }[];
        instanceCount += rows.length;
        for (const row of rows) {
            const key = (row.stage_key ?? "").trim();
            if (key) stageKeys.add(key);
        }
        if (rows.length < PAGE) break;
    }

    return { stage_keys: [...stageKeys].sort(), instance_count: instanceCount };
}
