import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import {
    batchAllocatedCentsForJob,
    batchPaymentAllocationRollups,
    computeJobBalanceSnapshot,
    getPaymentIdsForJob,
} from "@/lib/admin/jobPaymentBalances";
import {
    effectivePaymentRowStatusKey,
    legacyPaymentStatusKeyFromSnapshot,
    type JobPaymentStatusKey,
} from "@/lib/admin/jobPaymentSummary";
import { fetchPaymentStatusKeyByIdMap } from "@/lib/admin/resolvePaymentStatusKeys";
import type { JobBalanceSnapshot, PaymentAllocationState } from "@/lib/admin/jobPaymentBalances";

export type JobPaymentRow = {
    id: string;
    created_at: string;
    amount_cents: number;
    /** Canonical lifecycle status. */
    status: string;
    received_at: string | null;
    posted_at: string | null;
    processor: string | null;
    processor_transaction_id: string | null;
    /** Active allocations to this job only (V1). */
    allocated_amount_cents: number;
    /** Payment-level unallocated remainder (all targets). */
    unallocated_amount_cents: number;
    allocation_state: PaymentAllocationState;
    paid_at: string | null;
    provider_payment_id: string | null;
    payment_status_id: string | null;
    status_key: string | null;
    payment_status: string | null;
    payment_statuses: { key: string; label?: string | null } | null;
};

/** Balance snapshot plus legacy keys expected by existing admin UI. */
export type JobPaymentsPaymentSummary = JobBalanceSnapshot & {
    original_amount_cents: number | null;
    balance_due_cents: number | null;
    payment_status_key: JobPaymentStatusKey;
};

export type JobPaymentsGetResponse = {
    payments: JobPaymentRow[];
    payment_summary: JobPaymentsPaymentSummary;
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
    const { data: job } = await supabase.from("jobs").select("id").eq("id", jobId).eq("org_id", ctx.orgId).maybeSingle();
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

    const paymentIds = await getPaymentIdsForJob(supabase, ctx.orgId, jobId);

    let rows: Record<string, unknown>[] = [];
    if (paymentIds.length > 0) {
        const { data, error } = await supabase
            .from("payments")
            .select(
                "id, created_at, amount_cents, status, received_at, posted_at, processor, processor_transaction_id, paid_at, provider_payment_id, payment_status_id, status_key, org_id"
            )
            .eq("org_id", ctx.orgId)
            .in("id", paymentIds)
            .order("created_at", { ascending: false });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        rows = (data ?? []) as Record<string, unknown>[];
    }

    const snap = await computeJobBalanceSnapshot(supabase, ctx.orgId, jobId);
    const payment_summary: JobPaymentsPaymentSummary = {
        ...snap,
        original_amount_cents: snap.job_total_cents,
        balance_due_cents: snap.outstanding_balance_cents,
        payment_status_key: legacyPaymentStatusKeyFromSnapshot(snap),
    };

    const rowIds = rows.map((r) => r.id as string);
    const amountById = new Map<string, number>();
    for (const r of rows) {
        amountById.set(r.id as string, toInt((r as { amount_cents?: unknown }).amount_cents));
    }
    const [rollups, toJobAlloc] = await Promise.all([
        batchPaymentAllocationRollups(supabase, ctx.orgId, rowIds, amountById),
        batchAllocatedCentsForJob(supabase, ctx.orgId, jobId, rowIds),
    ]);

    const statusIdToKey = await fetchPaymentStatusKeyByIdMap(
        supabase,
        rows.map((r) => (r as { payment_status_id?: string | null }).payment_status_id)
    );

    const orgIds = [...new Set(rows.map((r) => (r as { org_id?: string | null }).org_id).filter(Boolean))] as string[];
    const labelByOrg = new Map<string, Map<string, string>>();
    for (const oid of orgIds) {
        const defs = await fetchEffectiveStatusDefinitions(supabase, oid, "payments", { activeOnly: true });
        labelByOrg.set(oid, new Map(defs.map((d) => [d.status_key, (d.status_label?.trim() || d.status_key) as string])));
    }

    const payments: JobPaymentRow[] = rows.map((r) => {
        const raw = r as {
            id: string;
            created_at: string;
            amount_cents: unknown;
            status?: string | null;
            received_at?: string | null;
            posted_at?: string | null;
            processor?: string | null;
            processor_transaction_id?: string | null;
            paid_at?: string | null;
            provider_payment_id?: string | null;
            payment_status_id?: string | null;
            status_key?: string | null;
            org_id?: string | null;
        };
        const rollup = rollups.get(raw.id)!;
        const allocatedToJob = toJobAlloc.get(raw.id) ?? 0;
        const statusCanon = (raw.status != null && String(raw.status).trim() !== "" ? String(raw.status).trim() : "pending").toLowerCase();

        const statusKeyCol = raw.status_key != null && String(raw.status_key).trim() !== "" ? String(raw.status_key).trim() : null;
        const fromFk =
            raw.payment_status_id && statusIdToKey.has(raw.payment_status_id)
                ? statusIdToKey.get(raw.payment_status_id)!
                : null;
        const resolvedLogicalKey = (statusKeyCol ?? fromFk ?? null)?.toLowerCase() ?? null;
        const lm = raw.org_id ? labelByOrg.get(raw.org_id) : null;
        const effectiveKey = effectivePaymentRowStatusKey({
            amount_cents: toInt(raw.amount_cents),
            paid_at: raw.paid_at ?? null,
            status_key: resolvedLogicalKey,
            payment_statuses: resolvedLogicalKey ? { key: resolvedLogicalKey } : null,
            status: statusCanon,
        });
        const label =
            lm && effectiveKey
                ? (lm.get(effectiveKey) ?? (statusKeyCol ? lm.get(statusKeyCol.toLowerCase()) : undefined) ?? effectiveKey)
                : effectiveKey;

        return {
            id: raw.id,
            created_at: raw.created_at,
            amount_cents: toInt(raw.amount_cents),
            status: statusCanon,
            received_at: raw.received_at ?? null,
            posted_at: raw.posted_at ?? null,
            processor: raw.processor ?? null,
            processor_transaction_id: raw.processor_transaction_id ?? null,
            allocated_amount_cents: allocatedToJob,
            unallocated_amount_cents: rollup.unallocated_amount_cents,
            allocation_state: rollup.allocation_state,
            paid_at: raw.paid_at ?? null,
            provider_payment_id: raw.provider_payment_id ?? null,
            payment_status_id: raw.payment_status_id ?? null,
            status_key: statusKeyCol,
            payment_status: effectiveKey,
            payment_statuses: { key: effectiveKey, label: label ?? effectiveKey },
        };
    });

    return NextResponse.json({ payments, payment_summary } satisfies JobPaymentsGetResponse);
}

function toInt(v: unknown): number {
    const n = typeof v === "bigint" ? Number(v) : Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n);
}
