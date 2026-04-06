import type { SupabaseClient } from "@supabase/supabase-js";

/** Trim env / config UUIDs so `.eq("org_id", …)` matches DB values. */
export function normalizePipelineResolveOrgId(orgId: string | null | undefined): string | null {
    if (orgId == null) return null;
    const s = String(orgId).trim();
    return s || null;
}

function rowStageKey(r: Record<string, unknown>): string {
    const v = r.key;
    return typeof v === "string" ? v.trim() : "";
}

function findStageIdByKey(rows: Record<string, unknown>[] | null | undefined, k: string): string | null {
    const hit = rows?.find((r) => rowStageKey(r) === k);
    const id = hit?.id;
    return typeof id === "string" && id.trim() ? id : null;
}

function mergeUniqueStages(
    ...arrays: Array<Record<string, unknown>[] | null | undefined>
): Record<string, unknown>[] {
    const map = new Map<string, Record<string, unknown>>();
    for (const arr of arrays) {
        for (const row of arr ?? []) {
            const id = row.id;
            if (typeof id === "string" && id.trim() && !map.has(id)) map.set(id, row);
        }
    }
    return [...map.values()];
}

function logPipelineResolveVerbose(payload: Record<string, unknown>): void {
    if (process.env.LOG_PIPELINE_STAGE_RESOLVE === "1") {
        console.warn("[PIPELINE_STAGE_RESOLVE]", JSON.stringify(payload));
    }
}

function logNeedsAQuoteMiss(payload: Record<string, unknown>): void {
    console.warn("[PIPELINE_STAGE_RESOLVE] needs_a_quote unresolved", JSON.stringify(payload));
}

/**
 * Resolve pipeline_stages.id by org + semantic key (Batch 3.7).
 * Configure rows: UPDATE pipeline_stages SET key = 'quote_started' WHERE …
 * Transitional env fallbacks: BOOK_V2_QUOTE_STARTED_STAGE_ID, BOOK_V2_NEEDS_A_QUOTE_STAGE_ID, BOOK_V2_BOOKED_STAGE_ID
 *
 * Important:
 * - Do not use `.eq("key", …)` in PostgREST filters — `key` is a reserved query parameter.
 * - Many deployments set `pipeline_stages.org_id` NULL while the stage belongs to an org via
 *   `pipelines.org_id` + `pipeline_stages.pipeline_id`. We union both scopes before matching in JS.
 */
export async function resolvePipelineStageIdByOrgKey(
    supabase: SupabaseClient,
    orgId: string | null | undefined,
    stageKey: string
): Promise<string | null> {
    const k = String(stageKey ?? "").trim();
    if (!k) return null;

    const effectiveOrg = normalizePipelineResolveOrgId(orgId);
    let orgScopedRows: Record<string, unknown>[] = [];
    let byStageOrgIdCount = 0;
    let byPipelineCount = 0;
    let pipelineIdsForOrg: string[] = [];

    if (effectiveOrg) {
        const { data: byStageOrgId } = await supabase
            .from("pipeline_stages")
            .select("*")
            .eq("org_id", effectiveOrg);
        byStageOrgIdCount = byStageOrgId?.length ?? 0;

        const { data: pipes } = await supabase.from("pipelines").select("id").eq("org_id", effectiveOrg);
        pipelineIdsForOrg = (pipes ?? [])
            .map((p) => (p as { id?: string }).id)
            .filter((id): id is string => typeof id === "string" && id.trim() !== "");

        let byPipeline: Record<string, unknown>[] | null = null;
        if (pipelineIdsForOrg.length > 0) {
            const { data: linked } = await supabase
                .from("pipeline_stages")
                .select("*")
                .in("pipeline_id", pipelineIdsForOrg);
            byPipeline = linked as Record<string, unknown>[] | null;
            byPipelineCount = byPipeline?.length ?? 0;
        }

        orgScopedRows = mergeUniqueStages(
            byStageOrgId as Record<string, unknown>[] | null,
            byPipeline as Record<string, unknown>[] | null
        );

        const idOrg = findStageIdByKey(orgScopedRows, k);
        logPipelineResolveVerbose({
            stageKey: k,
            org_id: effectiveOrg,
            by_stage_org_id_count: byStageOrgIdCount,
            pipeline_ids_for_org: pipelineIdsForOrg.length,
            by_pipeline_stages_count: byPipelineCount,
            merged_org_scope_count: orgScopedRows.length,
            found: Boolean(idOrg),
            keys_in_scope: orgScopedRows.map((r) => rowStageKey(r)).filter(Boolean),
        });

        if (idOrg) return idOrg;
    } else {
        logPipelineResolveVerbose({
            stageKey: k,
            org_id: null,
            note: "no org_id passed; skipping org-scoped queries",
        });
    }

    const { data: globalRows } = await supabase.from("pipeline_stages").select("*").is("org_id", null);
    const globalCount = globalRows?.length ?? 0;
    const idGlobal = findStageIdByKey(globalRows as Record<string, unknown>[] | null, k);
    logPipelineResolveVerbose({
        stageKey: k,
        phase: "global_org_id_null",
        row_count: globalCount,
        found: Boolean(idGlobal),
    });
    if (idGlobal) return idGlobal;

    const { data: scanRows } = await supabase.from("pipeline_stages").select("*").limit(5000);
    const scanCount = scanRows?.length ?? 0;
    const idScan = findStageIdByKey(scanRows as Record<string, unknown>[] | null, k);
    logPipelineResolveVerbose({
        stageKey: k,
        phase: "scan_limit_5000",
        row_count: scanCount,
        found: Boolean(idScan),
    });

    if (!idScan && k === "needs_a_quote") {
        logNeedsAQuoteMiss({
            org_id: effectiveOrg,
            by_stage_org_id_count: byStageOrgIdCount,
            pipeline_ids_for_org: pipelineIdsForOrg.length,
            by_pipeline_stages_count: byPipelineCount,
            merged_org_scope_count: orgScopedRows.length,
            global_org_id_null_count: globalCount,
            scan_count: scanCount,
            keys_in_org_scope: orgScopedRows.map((r) => rowStageKey(r)).filter(Boolean),
        });
    }

    return idScan;
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
