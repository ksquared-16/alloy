import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { computeJobDisplayTotalCents, type JobPriceInput } from "@/lib/admin/jobDisplayPrice";
import { computeJobPaymentSummary, effectivePaymentRowStatusKey, type JobPaymentSummary } from "@/lib/admin/jobPaymentSummary";
import { fetchPaymentStatusKeyByIdMap } from "@/lib/admin/resolvePaymentStatusKeys";

export type JobPaymentRow = {
    id: string;
    created_at: string;
    amount_cents: number;
    paid_at: string | null;
    provider_payment_id: string | null;
    payment_status_id: string | null;
    status_key: string | null;
    payment_status: string | null;
    payment_statuses: { key: string; label?: string | null } | null;
};

export type JobPaymentsGetResponse = {
    payments: JobPaymentRow[];
    payment_summary: JobPaymentSummary;
};

export async function GET(
    _request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const ctx = await getAdminContext();
    if (!ctx.ok) return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });

    const { id: jobId } = await context.params;
    if (!jobId) return NextResponse.json({ error: "Missing job id" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: job } = await supabase
        .from("jobs")
        .select("id, gross_price_cents, estimated_total_cents, discount_amount, discounted, recurring_total_cents")
        .eq("id", jobId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const jobOriginalCents = computeJobDisplayTotalCents(job as JobPriceInput);

    const { data: rows, error } = await supabase
        .from("payments")
        .select("id, created_at, amount_cents, paid_at, provider_payment_id, payment_status_id, status_key, org_id")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const statusIdToKey = await fetchPaymentStatusKeyByIdMap(
        supabase,
        (rows ?? []).map((r) => (r as { payment_status_id?: string | null }).payment_status_id)
    );

    const orgIds = [...new Set((rows ?? []).map((r) => (r as { org_id?: string | null }).org_id).filter(Boolean))] as string[];
    const labelByOrg = new Map<string, Map<string, string>>();
    for (const oid of orgIds) {
        const defs = await fetchEffectiveStatusDefinitions(supabase, oid, "payments", { activeOnly: true });
        labelByOrg.set(oid, new Map(defs.map((d) => [d.status_key, (d.status_label?.trim() || d.status_key) as string])));
    }

    const payments: JobPaymentRow[] = (rows ?? []).map((r) => {
        const raw = r as {
            id: string;
            created_at: string;
            amount_cents: number;
            paid_at?: string | null;
            provider_payment_id?: string | null;
            payment_status_id?: string | null;
            status_key?: string | null;
            org_id?: string | null;
        };
        const statusKeyCol = raw.status_key != null && String(raw.status_key).trim() !== "" ? String(raw.status_key).trim() : null;
        const fromFk =
            raw.payment_status_id && statusIdToKey.has(raw.payment_status_id)
                ? statusIdToKey.get(raw.payment_status_id)!
                : null;
        const resolvedLogicalKey = (statusKeyCol ?? fromFk ?? null)?.toLowerCase() ?? null;
        const lm = raw.org_id ? labelByOrg.get(raw.org_id) : null;
        const effectiveKey = effectivePaymentRowStatusKey({
            amount_cents: raw.amount_cents,
            paid_at: raw.paid_at ?? null,
            status_key: resolvedLogicalKey,
            payment_statuses: resolvedLogicalKey ? { key: resolvedLogicalKey } : null,
        });
        const label =
            lm && effectiveKey
                ? (lm.get(effectiveKey) ?? (statusKeyCol ? lm.get(statusKeyCol.toLowerCase()) : undefined) ?? effectiveKey)
                : effectiveKey;
        return {
            id: raw.id,
            created_at: raw.created_at,
            amount_cents: raw.amount_cents,
            paid_at: raw.paid_at ?? null,
            provider_payment_id: raw.provider_payment_id ?? null,
            payment_status_id: raw.payment_status_id ?? null,
            status_key: statusKeyCol,
            payment_status: effectiveKey,
            payment_statuses: { key: effectiveKey, label: label ?? effectiveKey },
        };
    });

    const payment_summary = computeJobPaymentSummary(jobOriginalCents, payments);
    return NextResponse.json({ payments, payment_summary } satisfies JobPaymentsGetResponse);
}
