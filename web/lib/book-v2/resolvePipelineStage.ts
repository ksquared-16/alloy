import type { SupabaseClient } from "@supabase/supabase-js";

function findStageIdByKey(rows: Record<string, unknown>[] | null | undefined, k: string): string | null {
    const hit = rows?.find((r) => r.key === k);
    const id = hit?.id;
    return typeof id === "string" && id.trim() ? id : null;
}

/**
 * Resolve pipeline_stages.id by org + semantic key (Batch 3.7).
 * Configure rows: UPDATE pipeline_stages SET key = 'quote_started' WHERE …
 * Transitional env fallbacks: BOOK_V2_QUOTE_STARTED_STAGE_ID, BOOK_V2_NEEDS_A_QUOTE_STAGE_ID, BOOK_V2_BOOKED_STAGE_ID
 *
 * Important: do not use `.eq("key", …)` in PostgREST filters — `key` is a reserved
 * query parameter and the filter can be dropped, breaking `.maybeSingle()` (multiple
 * rows per org) and forcing callers to fall back to legacy stage UUIDs.
 */
export async function resolvePipelineStageIdByOrgKey(
    supabase: SupabaseClient,
    orgId: string | null | undefined,
    stageKey: string
): Promise<string | null> {
    const k = String(stageKey ?? "").trim();
    if (!k) return null;

    if (orgId) {
        const { data: orgRows } = await supabase.from("pipeline_stages").select("*").eq("org_id", orgId);
        const id = findStageIdByKey(orgRows as Record<string, unknown>[] | null, k);
        if (id) return id;
    }

    const { data: globalRows } = await supabase.from("pipeline_stages").select("*").is("org_id", null);
    const idGlobal = findStageIdByKey(globalRows as Record<string, unknown>[] | null, k);
    if (idGlobal) return idGlobal;

    const { data: scanRows } = await supabase.from("pipeline_stages").select("*").limit(5000);
    return findStageIdByKey(scanRows as Record<string, unknown>[] | null, k);
}

export function pipelineStageEnvFallback(stageKey: "quote_started" | "booked" | "needs_a_quote"): string | null {
    if (stageKey === "quote_started") {
        const v = process.env.BOOK_V2_QUOTE_STARTED_STAGE_ID?.trim();
        return v || null;
    }
    if (stageKey === "needs_a_quote") {
        const v = process.env.BOOK_V2_NEEDS_A_QUOTE_STAGE_ID?.trim();
        return v || null;
    }
    const v = process.env.BOOK_V2_BOOKED_STAGE_ID?.trim();
    return v || null;
}
