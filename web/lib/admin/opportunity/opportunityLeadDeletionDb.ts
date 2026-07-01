import type { SupabaseClient } from "@supabase/supabase-js";

const CHUNK = 150;

export function chunkIds<T>(ids: readonly T[]): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < ids.length; i += CHUNK) {
        out.push(ids.slice(i, i + CHUNK) as T[]);
    }
    return out;
}

export async function countByIn(
    supabase: SupabaseClient,
    table: string,
    column: string,
    ids: readonly string[],
    orgId?: string
): Promise<number> {
    if (!ids.length) return 0;
    let total = 0;
    for (const part of chunkIds(ids)) {
        let q = supabase.from(table).select("id", { count: "exact", head: true }).in(column, part);
        if (orgId) q = q.eq("org_id", orgId);
        const { count, error } = await q;
        if (error) throw new Error(`count ${table}.${column}: ${error.message}`);
        total += count ?? 0;
    }
    return total;
}

export async function countByEq(
    supabase: SupabaseClient,
    table: string,
    filters: Record<string, string>,
    orgId?: string
): Promise<number> {
    let q = supabase.from(table).select("id", { count: "exact", head: true });
    if (orgId) q = q.eq("org_id", orgId);
    for (const [key, value] of Object.entries(filters)) {
        q = q.eq(key, value);
    }
    const { count, error } = await q;
    if (error) throw new Error(`count ${table}: ${error.message}`);
    return count ?? 0;
}

export async function selectIdsByIn(
    supabase: SupabaseClient,
    table: string,
    column: string,
    ids: readonly string[],
    orgId?: string
): Promise<string[]> {
    if (!ids.length) return [];
    const out: string[] = [];
    for (const part of chunkIds(ids)) {
        let q = supabase.from(table).select("id").in(column, part);
        if (orgId) q = q.eq("org_id", orgId);
        const { data, error } = await q;
        if (error) throw new Error(`select ${table}.${column}: ${error.message}`);
        for (const row of data ?? []) {
            const id = typeof (row as { id?: string }).id === "string" ? (row as { id: string }).id.trim() : "";
            if (id) out.push(id);
        }
    }
    return out;
}

export async function deleteByIn(
    supabase: SupabaseClient,
    table: string,
    column: string,
    ids: readonly string[],
    orgId?: string
): Promise<number> {
    if (!ids.length) return 0;
    let total = 0;
    for (const part of chunkIds(ids)) {
        let q = supabase.from(table).delete().in(column, part).select("id");
        if (orgId) q = q.eq("org_id", orgId);
        const { data, error } = await q;
        if (error) throw new Error(`delete ${table}.${column}: ${error.message}`);
        total += (data ?? []).length;
    }
    return total;
}

/** Tables without a simple `id` column for select — count then delete. */
export async function deleteByInHeadCount(
    supabase: SupabaseClient,
    table: string,
    column: string,
    ids: readonly string[],
    orgId?: string
): Promise<number> {
    if (!ids.length) return 0;
    let total = 0;
    for (const part of chunkIds(ids)) {
        let countQ = supabase.from(table).select("*", { count: "exact", head: true }).in(column, part);
        if (orgId) countQ = countQ.eq("org_id", orgId);
        const { count, error: countErr } = await countQ;
        if (countErr) throw new Error(`count ${table}.${column}: ${countErr.message}`);
        if (!count) continue;

        let deleteQ = supabase.from(table).delete().in(column, part);
        if (orgId) deleteQ = deleteQ.eq("org_id", orgId);
        const { error } = await deleteQ;
        if (error) throw new Error(`delete ${table}.${column}: ${error.message}`);
        total += count;
    }
    return total;
}

export async function deleteFieldValuesForEntities(
    supabase: SupabaseClient,
    orgId: string,
    entityType: string,
    entityIds: readonly string[]
): Promise<number> {
    if (!entityIds.length) return 0;
    let total = 0;
    for (const part of chunkIds(entityIds)) {
        const { data, error } = await supabase
            .from("field_values")
            .delete()
            .eq("org_id", orgId)
            .eq("entity_type", entityType)
            .in("entity_id", part)
            .select("id");
        if (error) throw new Error(`delete field_values ${entityType}: ${error.message}`);
        total += (data ?? []).length;
    }
    return total;
}
