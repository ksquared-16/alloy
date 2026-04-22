import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { computeOpportunityLifecycleKpis } from "@/lib/workspace/computeOpportunityLifecycleKpis";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing department id" }, { status: 400 });

    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    try {
        const supabase = createAdminClient();

        const { data: rows, error } = await supabase
            .from("opportunities")
            .select("status_key, quote_total")
            .eq("org_id", ctx.orgId)
            .eq("department_id", id)
            .limit(5000);

        if (error) {
            return NextResponse.json({ error: error.message || "Failed to load opportunities" }, { status: 500 });
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

