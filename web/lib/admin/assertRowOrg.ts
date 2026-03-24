import type { SupabaseClient } from "@supabase/supabase-js";

export type AssertRowOrgOptions = {
    /** Primary key column (default `id`). */
    idColumn?: string;
    /** Org column (default `org_id`). */
    orgColumn?: string;
    /** Columns to select (default primary key column only). */
    columns?: string;
};

export type AssertRowOrgResult = { ok: true } | { ok: false };

/**
 * Verify a row exists and belongs to orgId before sensitive reads or mutations
 * (service-role client bypasses RLS).
 */
export async function assertRowOrg(
    supabase: SupabaseClient,
    table: string,
    rowId: string,
    orgId: string,
    options?: AssertRowOrgOptions
): Promise<AssertRowOrgResult> {
    const idCol = options?.idColumn ?? "id";
    const orgCol = options?.orgColumn ?? "org_id";
    const cols = options?.columns ?? idCol;
    const { data, error } = await supabase.from(table).select(cols).eq(idCol, rowId).eq(orgCol, orgId).maybeSingle();
    if (error) {
        console.error("[assertRowOrg]", table, error);
        return { ok: false };
    }
    if (!data) return { ok: false };
    return { ok: true };
}
