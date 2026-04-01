import type { SupabaseClient } from "@supabase/supabase-js";

/** Batch-resolve `job_statuses.key` by id (for list enrichment). */
export async function fetchJobStatusKeyByFk(
    supabase: SupabaseClient,
    jobStatusIds: (string | null | undefined)[]
): Promise<Map<string, string>> {
    const ids = [...new Set(jobStatusIds.filter((x): x is string => typeof x === "string" && x.length > 0))];
    if (ids.length === 0) return new Map();
    const { data, error } = await supabase.from("job_statuses").select("id, key").in("id", ids);
    if (error || !data) return new Map();
    const m = new Map<string, string>();
    for (const row of data as { id: string; key?: string | null }[]) {
        if (row.key != null && String(row.key).trim()) m.set(row.id, String(row.key).trim());
    }
    return m;
}

/** Prefer `status_key`; if empty, use key from `job_status_id` FK. */
export function effectiveJobStatusKey(
    row: { status_key?: string | null; job_status_id?: string | null },
    keyByFk: Map<string, string>
): string | null {
    const direct = row.status_key != null && String(row.status_key).trim() !== "" ? String(row.status_key).trim() : null;
    if (direct) return direct;
    const fk = row.job_status_id;
    if (fk && keyByFk.has(fk)) {
        const k = keyByFk.get(fk);
        return k && String(k).trim() ? String(k).trim() : null;
    }
    return null;
}
