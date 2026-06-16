/**
 * Batch opportunity status/stage label resolution — shared by drawer, inbox, and Communications.
 * Uses resolveOpportunityStatusDisplay only; no comms-specific stage model.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import {
    resolveOpportunityStatusDisplay,
    type OpportunityStatusDefLike,
} from "@/lib/admin/drawer/opportunityStatusDisplayResolve";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export type OpportunityStatusSourceRow = {
    id: string;
    status_key?: string | null;
    status?: string | null;
    pipeline_stage_id?: string | null;
    customer_id?: string | null;
};

type OpportunityStatusMeta = {
    statusKey: string | null;
    legacyStatus: string | null;
    pipelineStageId: string | null;
};

function metaFromRow(row: OpportunityStatusSourceRow): OpportunityStatusMeta {
    const statusKey = row.status_key != null ? String(row.status_key).trim() || null : null;
    const legacyStatus = row.status != null ? String(row.status).trim() || null : null;
    const pipelineStageId =
        row.pipeline_stage_id && UUID_RE.test(String(row.pipeline_stage_id))
            ? String(row.pipeline_stage_id)
            : null;
    return { statusKey, legacyStatus, pipelineStageId };
}

/**
 * Resolve operator-facing opportunity status labels for a set of opportunity rows.
 * Same path as opportunity drawer hydrate and inbox thread enrichment.
 */
export async function resolveOpportunityStatusLabelsBatch(
    supabase: SupabaseClient,
    orgId: string,
    rows: OpportunityStatusSourceRow[]
): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const metaByOppId = new Map<string, OpportunityStatusMeta>();
    const pipelineStageIds = new Set<string>();

    for (const row of rows) {
        const id = String(row.id ?? "").trim();
        if (!UUID_RE.test(id) || metaByOppId.has(id)) continue;
        const meta = metaFromRow(row);
        metaByOppId.set(id, meta);
        if (meta.pipelineStageId) pipelineStageIds.add(meta.pipelineStageId);
    }

    if (metaByOppId.size === 0) return out;

    const pipelineStageNames = new Map<string, string>();
    if (pipelineStageIds.size > 0) {
        const { data: stages } = await supabase
            .from("pipeline_stages")
            .select("id, name")
            .eq("org_id", orgId)
            .in("id", [...pipelineStageIds]);
        for (const stage of stages ?? []) {
            const id = String((stage as { id: string }).id);
            const name = ((stage as { name?: string | null }).name ?? "").trim();
            if (name) pipelineStageNames.set(id, name);
        }
    }

    const statusDefs: OpportunityStatusDefLike[] =
        await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", { activeOnly: true });

    for (const [oppId, meta] of metaByOppId) {
        const label = resolveOpportunityStatusDisplay({
            statusKey: meta.statusKey,
            legacyStatus: meta.legacyStatus,
            statusDefs,
            pipelineStageId: meta.pipelineStageId,
            pipelineStageName: meta.pipelineStageId ? pipelineStageNames.get(meta.pipelineStageId) ?? null : null,
        });
        if (label?.trim()) out.set(oppId, label.trim());
    }

    return out;
}

/** Pick the primary opportunity id for a customer (explicit anchor, else first matching row). */
export function resolvePrimaryOpportunityIdForCustomer(
    customerId: string,
    rows: OpportunityStatusSourceRow[],
    explicitOppId?: string | null
): string | null {
    const cid = customerId.trim();
    if (!UUID_RE.test(cid)) return null;
    if (explicitOppId && UUID_RE.test(explicitOppId)) return explicitOppId;
    const match = rows.find((r) => String(r.customer_id ?? "").trim() === cid);
    return match && UUID_RE.test(String(match.id)) ? String(match.id) : null;
}

/** Resolved business-process stage label for a customer household. */
export function resolveCustomerStageLabelFromOpportunities(
    customerId: string,
    rows: OpportunityStatusSourceRow[],
    statusLabels: Map<string, string>,
    explicitOppId?: string | null
): string | null {
    const oppId = resolvePrimaryOpportunityIdForCustomer(customerId, rows, explicitOppId);
    if (!oppId) return null;
    return statusLabels.get(oppId) ?? null;
}
