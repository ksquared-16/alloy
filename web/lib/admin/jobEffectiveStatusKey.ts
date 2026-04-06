import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve an active `job_statuses` row for a canonical key: org-specific first, then global (org_id null), then any active row.
 * Used to keep `job_status_id` aligned with `status_key` on writes.
 */
export async function resolveJobStatusRowByOrgAndKey(
    supabase: SupabaseClient,
    orgId: string | null | undefined,
    statusKey: string
): Promise<{ id: string; key: string } | null> {
    const k = String(statusKey ?? "").trim();
    if (!k) return null;

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
    return null;
}

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
