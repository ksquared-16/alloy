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
    /**
     * Running instances whose child no longer exists — excluded from `stage_keys` and `instance_count`.
     * They resolve into no lane before or after adoption (every lane reads the child), so they cannot be
     * stranded by it; counting them would tell the operator about records nobody can see.
     */
    orphaned_instance_count: number;
};

const PAGE = 1000;
const ID_CHUNK = 200;

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
    let orphanedCount = 0;

    for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
            .from("process_instances")
            .select("id, stage_key, subject_type, subject_id")
            .eq("org_id", params.orgId)
            .eq("process_key", params.processKey)
            .is("close_reason_key", null)
            // A stable unique tiebreaker: without it a paged read can repeat or skip rows.
            .order("id", { ascending: true })
            .range(from, from + PAGE - 1);

        if (error) throw new Error(`Could not read process instances: ${error.message}`);
        const rows = (data ?? []) as { id: string; stage_key: string | null; subject_type?: string | null; subject_id?: string | null }[];
        const existing = await existingChildIds(supabase, params.orgId, rows);
        for (const row of rows) {
            if (row.subject_type === "child" && row.subject_id && !existing.has(row.subject_id)) {
                orphanedCount += 1;
                continue;
            }
            instanceCount += 1;
            const key = (row.stage_key ?? "").trim();
            if (key) stageKeys.add(key);
        }
        if (rows.length < PAGE) break;
    }

    return { stage_keys: [...stageKeys].sort(), instance_count: instanceCount, orphaned_instance_count: orphanedCount };
}

/** The child-subject ids on this page that still exist (customer_members), read in bounded chunks. */
async function existingChildIds(
    supabase: SupabaseClient,
    orgId: string,
    rows: { subject_type?: string | null; subject_id?: string | null }[],
): Promise<Set<string>> {
    const ids = [...new Set(rows.filter((r) => r.subject_type === "child" && r.subject_id).map((r) => r.subject_id as string))];
    const found = new Set<string>();
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
        const { data, error } = await supabase
            .from("customer_members")
            .select("id")
            .eq("org_id", orgId)
            .in("id", ids.slice(i, i + ID_CHUNK));
        if (error) throw new Error(`Could not read children: ${error.message}`);
        for (const r of (data ?? []) as { id: string }[]) found.add(r.id);
    }
    return found;
}
