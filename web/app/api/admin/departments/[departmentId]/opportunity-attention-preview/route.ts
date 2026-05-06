import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { buildOpportunityAttentionQueueItems } from "@/lib/workspace/buildOpportunityAttentionQueueItems";
import { resolveOpportunityAttentionConfigFromMetadata } from "@/lib/opportunities/opportunityAttentionConfig";
import {
    applyAttentionConfigLabelsToBuckets,
    hydrateNeedsAttentionBucketCounts,
    resolveNeedsAttentionBucketsFromMetadata,
} from "@/lib/opportunities/needsAttentionBuckets";
import { enrichOpportunityQueueRowsWithActivitySignals } from "@/lib/admin/activitySignals";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { scopeDimensionsFromAccess } from "@/lib/admin/accessScope";
import { buildWorkUnitScopedNeedsAttentionLaneBuckets } from "@/lib/workspace/buildWorkUnitScopedNeedsAttentionLaneBuckets";
import { DEFAULT_OPPORTUNITY_ATTENTION_RULES_V1 } from "@/lib/workspace/opportunityAttentionRules";

/**
 * GET — Needs attention preview for a department.
 *
 * **Default / recommended:** resolve `needs_attention` work unit for this department (or pass `work_unit_id`)
 * and return **work-unit-scoped** bucket counts aligned with execution (`needs_attention` queue list cap).
 *
 * **Legacy fallback:** when no work unit can be resolved, uses org-wide capped preview (`bucket_count_scope=org_preview_cap_500`).
 */
export async function GET(request: NextRequest, context: { params: Promise<{ departmentId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);

    const { departmentId } = await context.params;
    if (!departmentId) return NextResponse.json({ error: "Missing department id" }, { status: 400 });

    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "departments", departmentId, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (dim.departmentScope === "restricted") {
        const allowed = dim.allowedDepartmentIds ?? [];
        if (!allowed.includes(departmentId)) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
    }

    try {
        const { data: deptRow } = await supabase
            .from("departments")
            .select("metadata")
            .eq("id", departmentId)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        const departmentMetadata = (deptRow as { metadata?: unknown } | null)?.metadata ?? null;

        const workUnitIdParam = (request.nextUrl.searchParams.get("work_unit_id") ?? "").trim();

        let targetWuId = workUnitIdParam;
        if (!targetWuId) {
            const { data: wuRows } = await supabase
                .from("work_units")
                .select("id, key")
                .eq("org_id", ctx.orgId)
                .eq("department_id", departmentId);
            const hit = (wuRows ?? []).find(
                (w) => String((w as { key?: string | null }).key ?? "").trim().toLowerCase() === "needs_attention",
            );
            targetWuId = hit && typeof (hit as { id?: string }).id === "string" ? String((hit as { id: string }).id) : "";
        }

        if (targetWuId) {
            const { data: wuRow } = await supabase
                .from("work_units")
                .select("id, metadata, department_id")
                .eq("id", targetWuId)
                .eq("org_id", ctx.orgId)
                .maybeSingle();
            const wuDept = String((wuRow as { department_id?: string | null } | null)?.department_id ?? "").trim();
            if (wuRow && wuDept === departmentId) {
                const wuMeta = (wuRow as { metadata?: unknown }).metadata ?? null;
                const scoped = await buildWorkUnitScopedNeedsAttentionLaneBuckets({
                    supabase,
                    orgId: ctx.orgId,
                    workUnitId: targetWuId,
                    workUnitMetadata: wuMeta,
                    departmentMetadata,
                    accessDim: dim,
                });

                const attnCfg = resolveOpportunityAttentionConfigFromMetadata(wuMeta);
                const rules = {
                    version: 1 as const,
                    thresholdsHours: { ...DEFAULT_OPPORTUNITY_ATTENTION_RULES_V1.thresholdsHours, ...attnCfg.thresholdsHours },
                };

                return NextResponse.json({
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
                });
            }
        }

        const { items, rules, attention_reason_counts, attention_evaluation } =
            await buildOpportunityAttentionQueueItems({
                supabase,
                orgId: ctx.orgId,
                attentionConfigMetadata: departmentMetadata,
                accessDim: dim,
                attentionQueueCohort: "department_attention_preview_config",
            });

        const attentionCfg = resolveOpportunityAttentionConfigFromMetadata(departmentMetadata);
        const bucketDefs = resolveNeedsAttentionBucketsFromMetadata(departmentMetadata);
        const needs_attention_buckets = applyAttentionConfigLabelsToBuckets(
            hydrateNeedsAttentionBucketCounts(bucketDefs, attention_reason_counts),
            attentionCfg,
        );

        let itemsOut = items;
        try {
            itemsOut = await enrichOpportunityQueueRowsWithActivitySignals({
                supabase,
                orgId: ctx.orgId,
                rows: items,
                workUnitMetadata: null,
                departmentMetadata,
            });
        } catch {
            itemsOut = items;
        }

        return NextResponse.json({
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
        });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
