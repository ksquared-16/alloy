import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions, RecordScopeConstraints } from "@/lib/admin/accessScope";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import { buildOpportunityAttentionQueueItems } from "@/lib/workspace/buildOpportunityAttentionQueueItems";
import { resolveOpportunityAttentionConfigFromMetadata } from "@/lib/opportunities/opportunityAttentionConfig";
import {
    applyAttentionConfigLabelsToBuckets,
    hydrateNeedsAttentionBucketCounts,
    resolveNeedsAttentionBucketsFromMetadata,
} from "@/lib/opportunities/needsAttentionBuckets";
import { enrichOpportunityQueueRowsWithActivitySignals } from "@/lib/admin/activitySignals";
import { buildWorkUnitScopedNeedsAttentionLaneBuckets } from "@/lib/workspace/buildWorkUnitScopedNeedsAttentionLaneBuckets";
import { DEFAULT_OPPORTUNITY_ATTENTION_RULES_V1 } from "@/lib/workspace/opportunityAttentionRules";

export type DeptAttentionPreviewPayload = {
    department_id: string;
    work_unit_id?: string | null;
    work_unit_key?: string;
    total?: number;
    needs_attention_buckets: Array<{
        key: string;
        label: string;
        description: string | null;
        count: number;
        reason_codes: string[];
        order?: number;
        priority?: number;
        icon?: string | null;
    }>;
    attention_reason_counts?: unknown;
    opportunity_needs_attention_semantics?: unknown;
    bucket_count_scope?: string | null;
    source?: string;
    items?: unknown[];
    rules?: unknown;
    attention_evaluation?: unknown;
    error?: string;
};

type WorkUnitRowLite = {
    id: string;
    key?: string | null;
    metadata?: unknown;
    department_id?: string | null;
};

export async function loadDeptAttentionPreviewServer(params: {
    supabase: SupabaseClient;
    orgId: string;
    departmentId: string;
    departmentMetadata: unknown;
    accessDim: AdminAccessScopeDimensions;
    workUnitIdParam?: string | null;
    /** When set (e.g. dept operational bootstrap), avoids a second work-units list query. */
    workUnitRows?: WorkUnitRowLite[];
    recordScopeImpossible?: boolean;
    recordScopeConstraints?: RecordScopeConstraints | null;
    opportunityStatusDefs?: StatusDefinitionRow[];
    attentionPerf?: {
        rules_ms?: number;
        query_ms?: number;
        membership_filter_ms?: number;
        resolver_ms?: number;
        bucket_merge_ms?: number;
        candidate_count?: number;
    };
}): Promise<DeptAttentionPreviewPayload> {
    const { supabase, orgId, departmentId, departmentMetadata, accessDim } = params;

    let targetWuId = (params.workUnitIdParam ?? "").trim();
    if (!targetWuId) {
        const rows =
            params.workUnitRows ??
            (
                await supabase
                    .from("work_units")
                    .select("id, key")
                    .eq("org_id", orgId)
                    .eq("department_id", departmentId)
            ).data ??
            [];
        const hit = rows.find(
            (w) => String((w as { key?: string | null }).key ?? "").trim().toLowerCase() === "needs_attention"
        );
        targetWuId =
            hit && typeof (hit as { id?: string }).id === "string" ? String((hit as { id: string }).id) : "";
    }

    if (targetWuId) {
        const wuRow =
            params.workUnitRows?.find((w) => w.id === targetWuId) ??
            (
                await supabase
                    .from("work_units")
                    .select("id, metadata, department_id")
                    .eq("id", targetWuId)
                    .eq("org_id", orgId)
                    .maybeSingle()
            ).data;
        const wuDept = String((wuRow as { department_id?: string | null } | null)?.department_id ?? "").trim();
        if (wuRow && wuDept === departmentId) {
            const wuMeta = (wuRow as { metadata?: unknown }).metadata ?? null;
                const scoped = await buildWorkUnitScopedNeedsAttentionLaneBuckets({
                    supabase,
                    orgId,
                    workUnitId: targetWuId,
                    workUnitMetadata: wuMeta,
                    departmentMetadata,
                    accessDim,
                    recordScopeImpossible: params.recordScopeImpossible,
                    recordScopeConstraints: params.recordScopeConstraints,
                    opportunityStatusDefs: params.opportunityStatusDefs,
                    perf: params.attentionPerf,
                });

            const attnCfg = resolveOpportunityAttentionConfigFromMetadata(wuMeta);
            const rules = {
                version: 1 as const,
                thresholdsHours: {
                    ...DEFAULT_OPPORTUNITY_ATTENTION_RULES_V1.thresholdsHours,
                    ...attnCfg.thresholdsHours,
                },
            };

            return {
                department_id: departmentId,
                work_unit_id: targetWuId,
                work_unit_key: "needs_attention",
                total: scoped.total_matches,
                needs_attention_buckets: scoped.needs_attention_buckets,
                attention_reason_counts: scoped.attention_reason_counts,
                opportunity_needs_attention_semantics: scoped.opportunity_needs_attention_semantics,
                bucket_count_scope: "work_unit_needs_attention_list_cap",
                source: "work_unit_needs_attention_lane",
                items: [],
                rules,
            };
        }
    }

    const { items, rules, attention_reason_counts, attention_evaluation } =
        await buildOpportunityAttentionQueueItems({
            supabase,
            orgId,
            attentionConfigMetadata: departmentMetadata,
            accessDim,
            attentionQueueCohort: "department_attention_preview_config",
        });

    const attentionCfg = resolveOpportunityAttentionConfigFromMetadata(departmentMetadata);
    const bucketDefs = resolveNeedsAttentionBucketsFromMetadata(departmentMetadata);
    const needs_attention_buckets = applyAttentionConfigLabelsToBuckets(
        hydrateNeedsAttentionBucketCounts(bucketDefs, attention_reason_counts),
        attentionCfg
    );

    let itemsOut = items;
    try {
        itemsOut = await enrichOpportunityQueueRowsWithActivitySignals({
            supabase,
            orgId,
            rows: items,
            workUnitMetadata: null,
            departmentMetadata,
        });
    } catch {
        itemsOut = items;
    }

    return {
        department_id: departmentId,
        work_unit_key: "needs_attention",
        total: itemsOut.length,
        items: itemsOut,
        rules,
        attention_reason_counts,
        needs_attention_buckets,
        bucket_count_scope: "org_preview_cap_500",
        source: "department_attention_preview",
        attention_evaluation,
    };
}
