/**
 * Layout V2 proof — isolated, READ-ONLY opportunities query.
 *
 *   GET /api/admin/layout-proof/opportunities?stage=<status_key>
 *
 * Returns real opportunity records for the org, filtered to a single stage of
 * the opportunity status lifecycle ("Lead Management" in product terms). The
 * default stage is `qualified` (the Qualification stage). Also returns the full
 * active lifecycle (status_definitions for opportunities) with per-stage counts
 * so the proof UI can show the lifecycle and offer a stage selector.
 *
 * Isolation guarantees (per sprint constraints):
 *  - This route is NOT used by any live drawer/queue/work-unit/bootstrap path.
 *  - It only reads (no writes). It does not import production renderers.
 *  - It is gated by the Layout V2 feature flag (404 when off).
 *  - Records are enriched with a few cheap joins (customer name, vertical name,
 *    status label) so config-driven fields resolve to real values; everything
 *    else falls back to placeholders in the renderer.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { isLayoutV2PreviewEnabledServer } from "@/lib/layout/featureFlag";

const ENTITY_TYPE = "opportunities";
const DEFAULT_STAGE = "qualified";
const MAX_RECORDS = 50;

type OppRow = Record<string, unknown> & {
    id: string;
    customer_id: string | null;
    vertical_id: string | null;
    status_key: string | null;
    status: string | null;
    updated_at: string | null;
    created_at: string | null;
};

export async function GET(request: NextRequest) {
    if (!isLayoutV2PreviewEnabledServer()) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    const { searchParams } = new URL(request.url);
    const stage = (searchParams.get("stage")?.trim() || DEFAULT_STAGE).toLowerCase();

    const supabase = createAdminClient();

    try {
        // --- Lifecycle: active opportunity statuses (org rows + industry defaults).
        const { data: statusRows, error: statusErr } = await supabase
            .from("status_definitions")
            .select("status_key, status_label, sort_order, is_active, org_id")
            .eq("entity_type", ENTITY_TYPE)
            .or(`org_id.eq.${ctx.orgId},org_id.is.null`)
            .order("sort_order", { ascending: true });
        if (statusErr) throw new Error(statusErr.message);

        const labelByKey = new Map<string, string>();
        const lifecycleSeen = new Set<string>();
        const lifecycle: { statusKey: string; label: string; sortOrder: number }[] = [];
        for (const s of statusRows ?? []) {
            const key = String((s as { status_key: string }).status_key);
            if (!labelByKey.has(key)) labelByKey.set(key, String((s as { status_label?: string }).status_label ?? key));
            if ((s as { is_active?: boolean }).is_active && !lifecycleSeen.has(key)) {
                lifecycleSeen.add(key);
                lifecycle.push({
                    statusKey: key,
                    label: labelByKey.get(key) as string,
                    sortOrder: Number((s as { sort_order?: number }).sort_order ?? 0),
                });
            }
        }

        // --- Per-stage counts across the org (one cheap column read).
        const { data: allKeys, error: keysErr } = await supabase
            .from("opportunities")
            .select("status_key")
            .eq("org_id", ctx.orgId);
        if (keysErr) throw new Error(keysErr.message);
        const counts: Record<string, number> = {};
        for (const r of allKeys ?? []) {
            const k = (r as { status_key: string | null }).status_key ?? "(none)";
            counts[k] = (counts[k] ?? 0) + 1;
        }

        // --- Records for the requested stage.
        const { data: oppData, error: oppErr } = await supabase
            .from("opportunities")
            .select(
                "id, name, title, source, job_date, job_time_window, appointment_id, customer_notes, status, status_key, pipeline_id, pipeline_stage_id, assigned_to, lost_reason, quote_subtotal, discount_amount, quote_total, recurring_price_cents, estimated_price_cents, monetary_value_cents, discount_code, discount_validated_at, external_source, external_id, customer_id, primary_person_id, primary_contact_id, location_id, vertical_id, org_id, created_at, updated_at",
            )
            .eq("org_id", ctx.orgId)
            .eq("status_key", stage)
            .order("updated_at", { ascending: false, nullsFirst: false })
            .limit(MAX_RECORDS);
        if (oppErr) throw new Error(oppErr.message);
        const opps = (oppData ?? []) as OppRow[];

        // --- Cheap enrichment joins (customer + vertical names).
        const customerIds = [...new Set(opps.map((o) => o.customer_id).filter(Boolean))] as string[];
        const verticalIds = [...new Set(opps.map((o) => o.vertical_id).filter(Boolean))] as string[];

        const customerName = new Map<string, string>();
        if (customerIds.length) {
            const { data } = await supabase.from("customers").select("id, name").in("id", customerIds);
            for (const c of data ?? []) customerName.set((c as { id: string }).id, String((c as { name?: string }).name ?? ""));
        }
        const verticalName = new Map<string, string>();
        if (verticalIds.length) {
            const { data } = await supabase.from("verticals").select("id, name").in("id", verticalIds);
            for (const v of data ?? []) verticalName.set((v as { id: string }).id, String((v as { name?: string }).name ?? ""));
        }

        const records = opps.map((o) => ({
            ...o,
            // Hydrated/derived keys the registry layout references:
            _status_display: o.status_key ? labelByKey.get(o.status_key) ?? o.status_key : o.status ?? null,
            _customer_name: o.customer_id ? customerName.get(o.customer_id) ?? null : null,
            _vertical_name: o.vertical_id ? verticalName.get(o.vertical_id) ?? null : null,
            _quote_total_display: o.quote_total ?? null,
            _updated: o.updated_at ?? o.created_at ?? null,
        }));

        return NextResponse.json({
            lifecycle: {
                key: "lead_management",
                label: "Lead Management",
                note: "Mapped to the opportunity status lifecycle (the only active lifecycle).",
                stages: lifecycle,
            },
            stage,
            counts,
            entityType: ENTITY_TYPE,
            records,
        });
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
