import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
import { buildOpportunityLifecycleFields } from "@/lib/admin/opportunityLifecyclePresentation";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import {
    attentionReasonLabel,
    computeOpportunityAttentionReason,
    DEFAULT_OPPORTUNITY_ATTENTION_RULES_V1,
    parseOpportunityAttentionRuleConfigV1FromMetadata,
    type OpportunityAttentionInputRow,
} from "@/lib/workspace/opportunityAttentionRules";
import {
    isOpportunityActiveForExecution,
    terminalOpportunityStatusKeysFromDefs,
} from "@/lib/workspace/opportunityExecutionEligibility";

const MAX_ROWS = 500;

/**
 * GET — Needs Attention queue for opportunity work units.
 * V1: computed reasons from effective lifecycle stage + last-touched time (updated_at/created_at).
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id: workUnitId } = await context.params;
    if (!workUnitId) return NextResponse.json({ error: "Missing work unit id" }, { status: 400 });

    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "work_units", workUnitId, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: wu, error: wuErr } = await supabase
        .from("work_units")
        .select("id, org_id, department_id, key, metadata")
        .eq("id", workUnitId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (wuErr || !wu) {
        return NextResponse.json({ error: wuErr?.message ?? "Not found" }, { status: 404 });
    }

    const key = ((wu as { key?: string | null }).key ?? "").trim().toLowerCase();
    if (key !== "needs_attention") {
        return NextResponse.json(
            { error: "This endpoint is only valid for work unit key needs_attention" },
            { status: 400 }
        );
    }

    const rules =
        parseOpportunityAttentionRuleConfigV1FromMetadata((wu as { metadata?: unknown }).metadata) ??
        DEFAULT_OPPORTUNITY_ATTENTION_RULES_V1;

    const oppDefs = await fetchEffectiveStatusDefinitions(supabase, ctx.orgId, "opportunities", { activeOnly: true });
    const terminalStatusKeys = terminalOpportunityStatusKeysFromDefs(oppDefs);
    const statusLabelByKey = new Map<string, string>();
    for (const d of oppDefs) {
        const k = String(d.status_key ?? "").trim();
        if (!k) continue;
        const label = String(d.status_label ?? "").trim();
        statusLabelByKey.set(k, label || k);
    }

    const { data: rows, error: oppErr } = await supabase
        .from("opportunities")
        .select("id, name, status_key, quote_total, customer_id, created_at, updated_at")
        .eq("org_id", ctx.orgId)
        .order("updated_at", { ascending: true, nullsFirst: false })
        .limit(MAX_ROWS);

    if (oppErr) return NextResponse.json({ error: oppErr.message }, { status: 500 });

    const nowMs = Date.now();
    const candidates = (rows ?? []) as Array<
        OpportunityAttentionInputRow & { name: string | null; customer_id: string | null }
    >;

    const withReason = candidates
        .map((row) => {
            if (!isOpportunityActiveForExecution({ statusKey: row.status_key, terminalStatusKeys })) {
                return { row, reason: null };
            }
            const reason = computeOpportunityAttentionReason({ row, defs: oppDefs, rules, nowMs });
            return { row, reason };
        })
        .filter((x): x is { row: typeof candidates[number]; reason: NonNullable<typeof x.reason> } => x.reason != null);

    const customerIds = [...new Set(withReason.map((x) => x.row.customer_id).filter(Boolean))] as string[];
    const customerNameById = new Map<string, string | null>();
    if (customerIds.length) {
        const { data: custs } = await supabase
            .from("customers")
            .select("id, name")
            .eq("org_id", ctx.orgId)
            .in("id", customerIds);
        for (const c of custs ?? []) {
            const r = c as { id: string; name: string | null };
            customerNameById.set(r.id, r.name ?? null);
        }
    }

    const items = withReason.map(({ row, reason }) => {
        const quoteNum =
            row.quote_total != null && !Number.isNaN(Number(row.quote_total)) && Number(row.quote_total) > 0
                ? Number(row.quote_total)
                : null;
        const lifecycle = buildOpportunityLifecycleFields({
            statusKey: row.status_key,
            quoteTotalDollars: quoteNum,
            defs: oppDefs,
        });
        const sk = row.status_key ? String(row.status_key).trim() : "";
        const _status_display = sk ? (statusLabelByKey.get(sk) ?? sk) : null;
        return {
            id: row.id,
            name: row.name,
            status_key: row.status_key,
            quote_total: row.quote_total != null ? Number(row.quote_total) : null,
            pipeline_stage_id: null,
            source: null,
            assigned_to: null,
            customer_id: row.customer_id,
            created_at: row.created_at,
            updated_at: row.updated_at,
            _customer_name: row.customer_id ? (customerNameById.get(row.customer_id) ?? null) : null,
            _status_display,
            _attention_reason: reason,
            _attention_reason_label: attentionReasonLabel(reason),
            ...lifecycle,
        };
    });

    return NextResponse.json({
        work_unit_id: workUnitId,
        work_unit_key: "needs_attention",
        total: items.length,
        items,
        rules,
    });
}

