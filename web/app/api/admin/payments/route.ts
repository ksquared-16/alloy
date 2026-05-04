import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import {
    accessScopeRestrictsData,
    assertJobInAccessScope,
    narrowJobIdsForScheduleList,
    scopeDimensionsFromAccess,
} from "@/lib/admin/accessScope";
import { collectPaymentIdsLinkedViaAllocationsToScopedJobs } from "@/lib/admin/adminPaymentListScope";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import {
    batchPaymentAllocationRollups,
    getPaymentIdsForJob,
    type PaymentAllocationState,
} from "@/lib/admin/jobPaymentBalances";
import { paymentAppStatusFromStatusKey } from "@/lib/admin/paymentStatusSync";

export type PaymentListItem = {
    id: string;
    created_at: string;
    updated_at?: string | null;
    amount_cents: number;
    status: string;
    received_at: string | null;
    posted_at: string | null;
    processor: string | null;
    processor_transaction_id: string | null;
    allocated_amount_cents: number;
    unallocated_amount_cents: number;
    allocation_state: PaymentAllocationState;
    provider_payment_id: string | null;
    payment_status_id: string | null;
    job_id: string | null;
    customer_id: string | null;
    status_key: string | null;
    payment_statuses: { key: string; label?: string | null } | null;
    paid_at?: string | null;
    posted_to_ledger_at?: string | null;
    provider?: string | null;
    _payment_label?: string | null;
    _customer_name?: string | null;
    _job_label?: string | null;
    _status_display?: string | null;
    _amount_display?: number | null;
    _posted_yes_no?: boolean;
    _updated?: string | null;
};

const CANONICAL_STATUS_LABEL: Record<string, string> = {
    pending: "Pending",
    posted: "Posted",
    failed: "Failed",
    voided: "Voided",
};

export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { searchParams } = new URL(request.url);
    const statusKey = searchParams.get("status");
    const statusKeyParam = searchParams.get("status_key")?.trim();
    const fromDate = searchParams.get("from_date");
    const toDate = searchParams.get("to_date");
    const jobId = searchParams.get("job_id");
    const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);
    const offset = Number(searchParams.get("offset")) || 0;

    const access = await getAdminAccessContextCached();
    if (!access.ok) return adminContextFailureResponse(access);

    const supabase = createAdminClient();
    if (jobId) {
        const jobOk = await assertRowOrg(supabase, "jobs", jobId, ctx.orgId);
        if (!jobOk.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

        const { data: jobScopeRow } = await supabase
            .from("jobs")
            .select("work_unit_id, location_id")
            .eq("id", jobId)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        if (!jobScopeRow) return NextResponse.json({ error: "Not found" }, { status: 404 });

        const dim = scopeDimensionsFromAccess(access);
        const jr = jobScopeRow as { work_unit_id?: string | null; location_id?: string | null };
        if (!(await assertJobInAccessScope(supabase, ctx.orgId, dim, { work_unit_id: jr.work_unit_id ?? null, location_id: jr.location_id ?? null }))) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }
    }

    let paymentIdFilter: string[] | null = null;
    if (jobId) {
        paymentIdFilter = await getPaymentIdsForJob(supabase, ctx.orgId, jobId);
    }

    if (jobId && paymentIdFilter !== null && paymentIdFilter.length === 0) {
        return NextResponse.json({ payments: [], total: 0 });
    }

    const selectCols =
        "id, created_at, updated_at, amount_cents, status, received_at, posted_at, processor, processor_transaction_id, provider_payment_id, payment_status_id, job_id, customer_id, org_id, status_key, paid_at, posted_to_ledger_at, provider";

    let q = supabase
        .from("payments")
        .select(selectCols, { count: "exact" })
        .eq("org_id", ctx.orgId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

    if (!jobId && accessScopeRestrictsData(scopeDimensionsFromAccess(access))) {
        const dim = scopeDimensionsFromAccess(access);
        const jobScope = await narrowJobIdsForScheduleList(supabase, ctx.orgId, dim, null);
        if (jobScope === "none") {
            return NextResponse.json({ payments: [], total: 0 });
        }
        const scopedJobIds = jobScope as string[];
        const orphanPaymentIds = await collectPaymentIdsLinkedViaAllocationsToScopedJobs(supabase, ctx.orgId, scopedJobIds);
        const parts: string[] = [];
        if (scopedJobIds.length) parts.push(`job_id.in.(${scopedJobIds.join(",")})`);
        if (orphanPaymentIds.length) parts.push(`id.in.(${orphanPaymentIds.join(",")})`);
        if (!parts.length) {
            return NextResponse.json({ payments: [], total: 0 });
        }
        q = q.or(parts.join(","));
    }

    if (paymentIdFilter) q = q.in("id", paymentIdFilter);
    if (statusKeyParam && /^[a-zA-Z0-9_-]+$/.test(statusKeyParam)) {
        q = q.or(`status.eq.${statusKeyParam},status_key.eq.${statusKeyParam}`);
    }
    if (fromDate) q = q.gte("created_at", fromDate);
    if (toDate) q = q.lte("created_at", toDate);

    const { data: rows, error, count } = await q;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const list = rows ?? [];
    const listIds = list.map((r) => (r as { id: string }).id);
    const amountById = new Map<string, number>();
    for (const row of list) {
        amountById.set((row as { id: string }).id, toInt((row as { amount_cents?: unknown }).amount_cents));
    }
    const rollups = await batchPaymentAllocationRollups(supabase, ctx.orgId, listIds, amountById);

    const { data: allocRows } =
        listIds.length > 0
            ? await supabase
                  .from("payment_allocations")
                  .select("payment_id, target_entity_id, target_entity_type, charge_id")
                  .eq("org_id", ctx.orgId)
                  .eq("status", "active")
                  .in("payment_id", listIds)
            : { data: [] as { payment_id: string; target_entity_id: string; target_entity_type: string; charge_id: string | null }[] };

    const chargeIdsForJobLookup = [
        ...new Set(
            (allocRows ?? [])
                .map((r) => (r as { charge_id?: string | null }).charge_id)
                .filter((x): x is string => typeof x === "string" && x.length > 0)
        ),
    ];

    const { data: chargeJobRows } =
        chargeIdsForJobLookup.length > 0
            ? await supabase
                  .from("charges")
                  .select("id, job_id")
                  .eq("org_id", ctx.orgId)
                  .in("id", chargeIdsForJobLookup)
            : { data: [] as { id: string; job_id: string }[] };

    const jobIdByChargeId = new Map<string, string>();
    for (const c of chargeJobRows ?? []) {
        const row = c as { id: string; job_id: string };
        if (row.id && row.job_id) jobIdByChargeId.set(row.id, row.job_id);
    }

    const jobIdFromAllocation = new Map<string, string>();
    for (const r of allocRows ?? []) {
        const pid = (r as { payment_id: string }).payment_id;
        const ttype = String((r as { target_entity_type?: string }).target_entity_type ?? "").toLowerCase();
        if (ttype !== "job") continue;
        if (!jobIdFromAllocation.has(pid)) {
            jobIdFromAllocation.set(pid, (r as { target_entity_id: string }).target_entity_id);
        }
    }
    for (const r of allocRows ?? []) {
        const pid = (r as { payment_id: string }).payment_id;
        if (jobIdFromAllocation.has(pid)) continue;
        const cid = (r as { charge_id?: string | null }).charge_id;
        if (cid && jobIdByChargeId.has(cid)) {
            jobIdFromAllocation.set(pid, jobIdByChargeId.get(cid)!);
        }
    }

    const customerIds = [...new Set(list.map((r) => (r as { customer_id?: string }).customer_id).filter(Boolean))] as string[];
    const jobIds = [
        ...new Set(
            list
                .map((r) => (r as { job_id?: string | null }).job_id ?? jobIdFromAllocation.get((r as { id: string }).id))
                .filter(Boolean)
        ),
    ] as string[];

    const [custRes, jobRes] = await Promise.all([
        customerIds.length
            ? supabase.from("customers").select("id, name").eq("org_id", ctx.orgId).in("id", customerIds)
            : { data: [] },
        jobIds.length
            ? supabase.from("jobs").select("id, title, service_key, job_number_for_customer").eq("org_id", ctx.orgId).in("id", jobIds)
            : { data: [] },
    ]);

    const customerMap = new Map((custRes.data ?? []).map((c) => [(c as { id: string }).id, (c as { name?: string | null }).name ?? null]));

    const paymentStatusLabelByOrg = new Map<string, string>();
    const defs = await fetchEffectiveStatusDefinitions(supabase, ctx.orgId, "payments", { activeOnly: true });
    for (const d of defs) {
        paymentStatusLabelByOrg.set(d.status_key, (d.status_label?.trim() || d.status_key) as string);
    }
    const jobLabelMap = new Map((jobRes.data ?? []).map((j) => {
        const row = j as { id: string; title?: string | null; service_key?: string | null; job_number_for_customer?: string | null };
        const label =
            (row.title && String(row.title).trim()) ||
            (row.service_key && String(row.service_key).trim()) ||
            (row.job_number_for_customer && String(row.job_number_for_customer).trim()) ||
            `Job #${row.id.slice(-6)}`;
        return [row.id, label];
    }));

    let payments: PaymentListItem[] = list.map((r) => {
        const id = (r as { id: string }).id;
        const statusKeyVal = (r as { status_key?: string | null }).status_key ?? null;
        const statusCanon =
            statusKeyVal != null && String(statusKeyVal).trim() !== ""
                ? paymentAppStatusFromStatusKey(String(statusKeyVal).trim())
                : (r as { status?: string | null }).status != null && String((r as { status?: string | null }).status).trim() !== ""
                  ? String((r as { status: string }).status).trim().toLowerCase()
                  : "pending";
        const canonicalLabel = CANONICAL_STATUS_LABEL[statusCanon] ?? statusCanon;
        const legacyLabel =
            statusKeyVal && paymentStatusLabelByOrg.size
                ? (paymentStatusLabelByOrg.get(statusKeyVal) ?? statusKeyVal)
                : statusKeyVal ?? null;
        const _status_display = canonicalLabel || legacyLabel;
        const statusObj: { key: string; label?: string | null } | null =
            statusCanon != null ? { key: statusCanon, label: _status_display } : null;

        const procRef =
            (r as { processor_transaction_id?: string | null }).processor_transaction_id?.trim() ||
            (r as { provider_payment_id?: string | null }).provider_payment_id?.trim() ||
            null;
        const _payment_label = procRef || `Payment #${id.slice(-6)}`;
        const _updated = (r as { updated_at?: string | null }).updated_at ?? (r as { created_at: string }).created_at;
        const rollup = rollups.get(id)!;
        const effectiveJobId = (r as { job_id?: string | null }).job_id ?? jobIdFromAllocation.get(id) ?? null;

        const postedYes =
            statusCanon === "posted" || !!(r as { posted_to_ledger_at?: string | null }).posted_to_ledger_at;

        return {
            id,
            created_at: (r as { created_at: string }).created_at,
            updated_at: (r as { updated_at?: string | null }).updated_at ?? null,
            amount_cents: toInt((r as { amount_cents: unknown }).amount_cents),
            status: statusCanon,
            received_at: (r as { received_at?: string | null }).received_at ?? null,
            posted_at: (r as { posted_at?: string | null }).posted_at ?? null,
            processor: (r as { processor?: string | null }).processor ?? null,
            processor_transaction_id: (r as { processor_transaction_id?: string | null }).processor_transaction_id ?? null,
            allocated_amount_cents: rollup.allocated_amount_cents,
            unallocated_amount_cents: rollup.unallocated_amount_cents,
            allocation_state: rollup.allocation_state,
            provider_payment_id: (r as { provider_payment_id?: string | null }).provider_payment_id ?? null,
            payment_status_id: (r as { payment_status_id?: string | null }).payment_status_id ?? null,
            job_id: (r as { job_id?: string | null }).job_id ?? null,
            customer_id: (r as { customer_id?: string | null }).customer_id ?? null,
            status_key: statusKeyVal,
            payment_statuses: statusObj,
            paid_at: (r as { paid_at?: string | null }).paid_at ?? null,
            posted_to_ledger_at: (r as { posted_to_ledger_at?: string | null }).posted_to_ledger_at ?? null,
            provider: (r as { provider?: string | null }).provider ?? null,
            _payment_label,
            _customer_name: (r as { customer_id?: string | null }).customer_id
                ? customerMap.get((r as { customer_id: string }).customer_id) ?? null
                : null,
            _job_label: effectiveJobId ? jobLabelMap.get(effectiveJobId) ?? null : null,
            _status_display,
            _amount_display: toInt((r as { amount_cents: unknown }).amount_cents) / 100,
            _posted_yes_no: postedYes,
            _updated,
        };
    });

    if (statusKey) {
        const keys = statusKey.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
        payments = payments.filter((p) => {
            const st = String(p.status ?? "").toLowerCase();
            const sk = String(p.status_key ?? "").toLowerCase();
            return keys.some((k) => st === k || sk === k);
        });
    }

    return NextResponse.json({
        payments,
        total: count ?? payments.length,
    });
}

function toInt(v: unknown): number {
    const n = typeof v === "bigint" ? Number(v) : Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n);
}
