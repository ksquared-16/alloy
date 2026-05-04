import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import {
    applyRecordScopeConstraintsToQuery,
    resolveRecordScopeConstraints,
    scopeDimensionsFromAccess,
} from "@/lib/admin/accessScope";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { computeOpportunityLifecycleKpis } from "@/lib/workspace/computeOpportunityLifecycleKpis";
import { resolveOpportunityQueueFromDefinition } from "@/lib/rrs/queue/resolveOpportunityQueue";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ departmentId: string }> }) {
    const { departmentId } = await context.params;
    if (!departmentId) return NextResponse.json({ error: "Missing department id" }, { status: 400 });

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);
    const dim = scopeDimensionsFromAccess(access);
    if (dim.departmentScope === "restricted") {
        const allowed = dim.allowedDepartmentIds ?? [];
        if (!allowed.includes(departmentId)) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
    }

    try {
        const supabase = createAdminClient();
        const scopeCons = await resolveRecordScopeConstraints(supabase, ctx.orgId, dim);

        // Department scoping for opportunities is defined by the configured work units, not a fixed column.
        // Use the department's `pipeline_overview` queue as the canonical scope when present.
        const { data: scopeWu, error: wuErr } = await supabase
            .from("work_units")
            .select("id, queue_definition")
            .eq("org_id", ctx.orgId)
            .eq("department_id", departmentId)
            .eq("key", "pipeline_overview")
            .maybeSingle();

        /** Matches entity GET / drawer: `effectiveOpportunityQuoteDollars` (quote_total → cent fallbacks). */
        type KpiOppRow = {
            status_key: string | null;
            quote_total: number | string | null;
            estimated_price_cents: number | string | null;
            monetary_value_cents: number | string | null;
        };
        let rows: KpiOppRow[] = [];
        if (wuErr) {
            return NextResponse.json({ error: wuErr.message || "Failed to load KPI scope work unit" }, { status: 500 });
        }

        if (scopeWu?.queue_definition) {
            const resolved = await resolveOpportunityQueueFromDefinition(
                supabase,
                ctx.orgId,
                (scopeWu as { queue_definition?: unknown }).queue_definition,
                dim
            );
            if (!resolved.ok) {
                const status = resolved.code === "INVALID_DEFINITION" ? 400 : 500;
                return NextResponse.json({ error: resolved.error, code: resolved.code }, { status });
            }

            // IMPORTANT: queue interpreter applies a `limit` for list rendering.
            // KPI counts must reflect the full filtered dataset, not the preview slice.
            const def = resolved.definition;
            let q = supabase
                .from("opportunities")
                .select("status_key, quote_total, estimated_price_cents, monetary_value_cents")
                .eq("org_id", ctx.orgId);
            const f = def.filters ?? {};
            if (f.status_keys?.length) q = q.in("status_key", f.status_keys);
            if (f.pipeline_stage_ids?.length) q = q.in("pipeline_stage_id", f.pipeline_stage_ids);
            if (f.source_keys?.length) q = q.in("source", f.source_keys);
            if (f.assigned_to?.length) q = q.in("assigned_to", f.assigned_to);
            if (f.quote_state === "no_positive_quote") q = q.or("quote_total.is.null,quote_total.lte.0");
            else if (f.quote_state === "has_positive_quote") q = q.gt("quote_total", 0);
            else if (f.quote_state === "quoted_not_booked") {
                q = q.gt("quote_total", 0);
                q = q.not("status_key", "in", "(\"booked\",\"scheduled\")");
                // Mirror interpreter behavior: also exclude booked pipeline stage when present.
                const { data: bookedStages } = await supabase
                    .from("pipeline_stages")
                    .select("id")
                    .eq("org_id", ctx.orgId)
                    .eq("key", "booked");
                const bookedIds = (bookedStages ?? []).map((r) => (r as { id: string }).id).filter(Boolean);
                if (bookedIds.length) {
                    q = q.or(`pipeline_stage_id.is.null,pipeline_stage_id.not.in.("${bookedIds.join('","')}")`);
                }
            }

            if (!scopeCons.impossible) {
                q = applyRecordScopeConstraintsToQuery(q, scopeCons);
            }

            let allRows: KpiOppRow[] | null = null;
            let allErr: { message: string } | null = null;
            if (!scopeCons.impossible) {
                const res = await q.limit(5000);
                allRows = res.data as KpiOppRow[] | null;
                allErr = res.error;
            }
            if (allErr) {
                return NextResponse.json({ error: allErr.message || "Failed to load KPI scoped opportunities" }, { status: 500 });
            }
            rows = (allRows ?? []) as KpiOppRow[];
        } else {
            // Fallback: org-wide opportunities (still useful as a visibility layer).
            let q = supabase
                .from("opportunities")
                .select("status_key, quote_total, estimated_price_cents, monetary_value_cents")
                .eq("org_id", ctx.orgId);
            if (!scopeCons.impossible) {
                q = applyRecordScopeConstraintsToQuery(q, scopeCons);
            }
            let data: KpiOppRow[] | null = null;
            let error: { message: string } | null = null;
            if (!scopeCons.impossible) {
                const res = await q.limit(5000);
                data = res.data as KpiOppRow[] | null;
                error = res.error;
            }
            if (error) {
                return NextResponse.json({ error: error.message || "Failed to load opportunities" }, { status: 500 });
            }
            rows = (data ?? []) as KpiOppRow[];
        }

        const defs = await fetchEffectiveStatusDefinitions(supabase, ctx.orgId, "opportunities", { activeOnly: true });
        const snapshot = computeOpportunityLifecycleKpis(rows ?? [], defs);

        const countsByKey = new Map<string, number>();
        for (const r of rows ?? []) {
            const k = String(r.status_key ?? "").trim();
            if (!k) continue;
            countsByKey.set(k, (countsByKey.get(k) ?? 0) + 1);
        }

        const statusBreakdown = defs
            .filter((d) => String(d.status_key ?? "").trim())
            .sort((a, b) => {
                const ao = typeof a.sort_order === "number" ? a.sort_order : 0;
                const bo = typeof b.sort_order === "number" ? b.sort_order : 0;
                return ao - bo;
            })
            .map((d) => {
                const key = String(d.status_key ?? "").trim();
                const label = String(d.status_label ?? "").trim() || key;
                const lifecycleStage = String((d.metadata as { lifecycle_stage?: string } | null)?.lifecycle_stage ?? "").trim() || null;
                return {
                    status_key: key,
                    status_label: label,
                    lifecycle_stage: lifecycleStage,
                    count: countsByKey.get(key) ?? 0,
                };
            });

        return NextResponse.json({
            ...snapshot,
            statusBreakdown,
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: message || "Failed to compute KPIs" }, { status: 500 });
    }
}
