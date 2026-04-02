import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve pipeline_stages.id by org + semantic key (Batch 3.7).
 * Configure rows: UPDATE pipeline_stages SET key = 'quote_started' WHERE …
 * Transitional env fallbacks: BOOK_V2_QUOTE_STARTED_STAGE_ID, BOOK_V2_BOOKED_STAGE_ID
 */
export async function resolvePipelineStageIdByOrgKey(
    supabase: SupabaseClient,
    orgId: string | null | undefined,
    stageKey: string
): Promise<string | null> {
    const k = String(stageKey ?? "").trim();
    if (!k) return null;

    if (orgId) {
        const { data: orgRow } = await supabase
            .from("pipeline_stages")
            .select("id")
            .eq("org_id", orgId)
            .eq("key", k)
            .maybeSingle();
        if ((orgRow as { id?: string } | null)?.id) return (orgRow as { id: string }).id;
    }

    const { data: globalRow } = await supabase
        .from("pipeline_stages")
        .select("id")
        .is("org_id", null)
        .eq("key", k)
        .maybeSingle();
    if ((globalRow as { id?: string } | null)?.id) return (globalRow as { id: string }).id;

    const { data: anyRow } = await supabase
        .from("pipeline_stages")
        .select("id")
        .eq("key", k)
        .limit(1)
        .maybeSingle();
    return (anyRow as { id?: string } | null)?.id ?? null;
}

export function pipelineStageEnvFallback(stageKey: "quote_started" | "booked"): string | null {
    if (stageKey === "quote_started") {
        const v = process.env.BOOK_V2_QUOTE_STARTED_STAGE_ID?.trim();
        return v || null;
    }
    const v = process.env.BOOK_V2_BOOKED_STAGE_ID?.trim();
    return v || null;
}
