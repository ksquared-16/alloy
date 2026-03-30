/**
 * Authoritative payment/balance reads for jobs: allocations + posted payments + job_line_items totals.
 * Server routes should use this module; do not duplicate balance math in handlers.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type PaymentAllocationState = "unallocated" | "partially_allocated" | "fully_allocated";

export type PaymentAllocationRollup = {
    allocated_amount_cents: number;
    unallocated_amount_cents: number;
    allocation_state: PaymentAllocationState;
};

export type JobBalanceSnapshot = {
    job_total_cents: number | null;
    /** Sum of active allocations to this job where parent payment.status = posted. */
    paid_amount_cents: number;
    /** max(0, job_total_cents - paid_amount_cents) when job_total_cents != null; else null. */
    outstanding_balance_cents: number | null;
    /**
     * Sum of active allocation amounts to this job where parent payment.status = pending
     * (earmarked but not yet financially applied to balance).
     */
    pending_payment_amount_cents: number;
};

function toIntCents(v: unknown): number {
    const n = typeof v === "bigint" ? Number(v) : Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n);
}

/**
 * Sum active job_line_items for the job; if none, fall back to jobs.total_cents.
 */
export async function getJobPricingTotalCents(
    supabase: SupabaseClient,
    orgId: string,
    jobId: string
): Promise<number | null> {
    const { data: lines, error: lineErr } = await supabase
        .from("job_line_items")
        .select("amount_cents")
        .eq("org_id", orgId)
        .eq("job_id", jobId)
        .eq("is_active", true);

    if (lineErr) {
        console.warn("[getJobPricingTotalCents] job_line_items:", lineErr.message);
    }

    const active = lines ?? [];
    if (active.length > 0) {
        let sum = 0;
        for (const row of active) {
            sum += toIntCents((row as { amount_cents?: unknown }).amount_cents);
        }
        return sum;
    }

    const { data: job, error: jobErr } = await supabase
        .from("jobs")
        .select("total_cents")
        .eq("id", jobId)
        .eq("org_id", orgId)
        .maybeSingle();

    if (jobErr) {
        console.warn("[getJobPricingTotalCents] jobs:", jobErr.message);
        return null;
    }

    const t = (job as { total_cents?: unknown } | null)?.total_cents;
    if (t == null) return null;
    return toIntCents(t);
}

/** Payment ids linked to a job via allocations (job target) or legacy payments.job_id. */
export async function getPaymentIdsForJob(supabase: SupabaseClient, orgId: string, jobId: string): Promise<string[]> {
    const [allocRes, legacyRes] = await Promise.all([
        supabase
            .from("payment_allocations")
            .select("payment_id")
            .eq("org_id", orgId)
            .eq("target_entity_type", "job")
            .eq("target_entity_id", jobId),
        supabase.from("payments").select("id").eq("org_id", orgId).eq("job_id", jobId),
    ]);

    const ids = new Set<string>();
    for (const r of allocRes.data ?? []) {
        const pid = (r as { payment_id?: string }).payment_id;
        if (pid) ids.add(pid);
    }
    for (const r of legacyRes.data ?? []) {
        const id = (r as { id?: string }).id;
        if (id) ids.add(id);
    }
    return [...ids];
}

/**
 * Active allocations to this job whose parent payment is posted.
 */
export async function getPostedAllocatedCentsForJob(
    supabase: SupabaseClient,
    orgId: string,
    jobId: string
): Promise<number> {
    const { data: allocs, error } = await supabase
        .from("payment_allocations")
        .select("payment_id, allocated_amount_cents")
        .eq("org_id", orgId)
        .eq("status", "active")
        .eq("target_entity_type", "job")
        .eq("target_entity_id", jobId);

    if (error) {
        console.warn("[getPostedAllocatedCentsForJob]:", error.message);
        return 0;
    }
    const rows = allocs ?? [];
    if (rows.length === 0) return 0;

    const paymentIds = [...new Set(rows.map((r) => (r as { payment_id: string }).payment_id))];
    const { data: posted, error: pErr } = await supabase
        .from("payments")
        .select("id")
        .eq("org_id", orgId)
        .in("id", paymentIds)
        .eq("status", "posted");

    if (pErr) {
        console.warn("[getPostedAllocatedCentsForJob] payments:", pErr.message);
        return 0;
    }
    const postedSet = new Set((posted ?? []).map((r) => (r as { id: string }).id));

    let sum = 0;
    for (const r of rows) {
        const pid = (r as { payment_id: string }).payment_id;
        if (!postedSet.has(pid)) continue;
        sum += toIntCents((r as { allocated_amount_cents?: unknown }).allocated_amount_cents);
    }
    return sum;
}

/**
 * Active allocations to this job whose parent payment is still pending.
 */
export async function getPendingAllocatedCentsForJob(
    supabase: SupabaseClient,
    orgId: string,
    jobId: string
): Promise<number> {
    const { data: allocs, error } = await supabase
        .from("payment_allocations")
        .select("payment_id, allocated_amount_cents")
        .eq("org_id", orgId)
        .eq("status", "active")
        .eq("target_entity_type", "job")
        .eq("target_entity_id", jobId);

    if (error) {
        console.warn("[getPendingAllocatedCentsForJob]:", error.message);
        return 0;
    }
    const rows = allocs ?? [];
    if (rows.length === 0) return 0;

    const paymentIds = [...new Set(rows.map((r) => (r as { payment_id: string }).payment_id))];
    const { data: pending, error: pErr } = await supabase
        .from("payments")
        .select("id")
        .eq("org_id", orgId)
        .in("id", paymentIds)
        .eq("status", "pending");

    if (pErr) {
        console.warn("[getPendingAllocatedCentsForJob] payments:", pErr.message);
        return 0;
    }
    const pendingSet = new Set((pending ?? []).map((r) => (r as { id: string }).id));

    let sum = 0;
    for (const r of rows) {
        const pid = (r as { payment_id: string }).payment_id;
        if (!pendingSet.has(pid)) continue;
        sum += toIntCents((r as { allocated_amount_cents?: unknown }).allocated_amount_cents);
    }
    return sum;
}

export async function computeJobBalanceSnapshot(
    supabase: SupabaseClient,
    orgId: string,
    jobId: string
): Promise<JobBalanceSnapshot> {
    const [job_total_cents, paid_amount_cents, pending_payment_amount_cents] = await Promise.all([
        getJobPricingTotalCents(supabase, orgId, jobId),
        getPostedAllocatedCentsForJob(supabase, orgId, jobId),
        getPendingAllocatedCentsForJob(supabase, orgId, jobId),
    ]);

    const outstanding_balance_cents =
        job_total_cents != null && Number.isFinite(job_total_cents)
            ? Math.max(0, Math.round(job_total_cents) - paid_amount_cents)
            : null;

    return {
        job_total_cents,
        paid_amount_cents,
        outstanding_balance_cents,
        pending_payment_amount_cents,
    };
}

function allocationStateFromAmounts(paymentAmount: number, allocatedActive: number): PaymentAllocationState {
    if (allocatedActive <= 0) return "unallocated";
    if (allocatedActive >= paymentAmount) return "fully_allocated";
    return "partially_allocated";
}

/**
 * Rollup across all active allocations for a payment (any target).
 */
export async function getPaymentAllocationRollup(
    supabase: SupabaseClient,
    orgId: string,
    paymentId: string,
    paymentAmountCents: number
): Promise<PaymentAllocationRollup> {
    const { data: allocs, error } = await supabase
        .from("payment_allocations")
        .select("allocated_amount_cents")
        .eq("org_id", orgId)
        .eq("payment_id", paymentId)
        .eq("status", "active");

    if (error) {
        console.warn("[getPaymentAllocationRollup]:", error.message);
        return {
            allocated_amount_cents: 0,
            unallocated_amount_cents: Math.max(0, paymentAmountCents),
            allocation_state: "unallocated",
        };
    }

    let allocated = 0;
    for (const r of allocs ?? []) {
        allocated += toIntCents((r as { allocated_amount_cents?: unknown }).allocated_amount_cents);
    }

    const amount = Math.max(0, toIntCents(paymentAmountCents));
    const clampedAlloc = Math.min(allocated, amount);
    const unallocated = Math.max(0, amount - clampedAlloc);

    return {
        allocated_amount_cents: clampedAlloc,
        unallocated_amount_cents: unallocated,
        allocation_state: allocationStateFromAmounts(amount, clampedAlloc),
    };
}

/** Active allocation cents for this payment toward a single job (V1). */
export async function getAllocatedAmountCentsForJob(
    supabase: SupabaseClient,
    orgId: string,
    paymentId: string,
    jobId: string
): Promise<number> {
    const { data: rows, error } = await supabase
        .from("payment_allocations")
        .select("allocated_amount_cents")
        .eq("org_id", orgId)
        .eq("payment_id", paymentId)
        .eq("status", "active")
        .eq("target_entity_type", "job")
        .eq("target_entity_id", jobId);

    if (error) {
        console.warn("[getAllocatedAmountCentsForJob]:", error.message);
        return 0;
    }
    let sum = 0;
    for (const r of rows ?? []) {
        sum += toIntCents((r as { allocated_amount_cents?: unknown }).allocated_amount_cents);
    }
    return sum;
}

export type BatchRollup = PaymentAllocationRollup;

/** Active allocated cents per payment_id for many payments (single query). */
export async function batchPaymentAllocationRollups(
    supabase: SupabaseClient,
    orgId: string,
    paymentIds: string[],
    paymentAmountById: Map<string, number>
): Promise<Map<string, BatchRollup>> {
    const out = new Map<string, BatchRollup>();
    if (paymentIds.length === 0) return out;

    const { data: allocs, error } = await supabase
        .from("payment_allocations")
        .select("payment_id, allocated_amount_cents")
        .eq("org_id", orgId)
        .eq("status", "active")
        .in("payment_id", paymentIds);

    if (error) {
        console.warn("[batchPaymentAllocationRollups]:", error.message);
        for (const id of paymentIds) {
            const amt = paymentAmountById.get(id) ?? 0;
            out.set(id, {
                allocated_amount_cents: 0,
                unallocated_amount_cents: Math.max(0, amt),
                allocation_state: "unallocated",
            });
        }
        return out;
    }

    const sumByPayment = new Map<string, number>();
    for (const r of allocs ?? []) {
        const pid = (r as { payment_id: string }).payment_id;
        const add = toIntCents((r as { allocated_amount_cents?: unknown }).allocated_amount_cents);
        sumByPayment.set(pid, (sumByPayment.get(pid) ?? 0) + add);
    }

    for (const id of paymentIds) {
        const amount = Math.max(0, toIntCents(paymentAmountById.get(id) ?? 0));
        const allocatedRaw = sumByPayment.get(id) ?? 0;
        const clampedAlloc = Math.min(allocatedRaw, amount);
        const unallocated = Math.max(0, amount - clampedAlloc);
        out.set(id, {
            allocated_amount_cents: clampedAlloc,
            unallocated_amount_cents: unallocated,
            allocation_state: allocationStateFromAmounts(amount, clampedAlloc),
        });
    }
    return out;
}

/** Active allocation cents per payment toward a specific job (batch). */
export async function batchAllocatedCentsForJob(
    supabase: SupabaseClient,
    orgId: string,
    jobId: string,
    paymentIds: string[]
): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    for (const id of paymentIds) out.set(id, 0);
    if (paymentIds.length === 0) return out;

    const { data: rows, error } = await supabase
        .from("payment_allocations")
        .select("payment_id, allocated_amount_cents")
        .eq("org_id", orgId)
        .eq("status", "active")
        .eq("target_entity_type", "job")
        .eq("target_entity_id", jobId)
        .in("payment_id", paymentIds);

    if (error) {
        console.warn("[batchAllocatedCentsForJob]:", error.message);
        return out;
    }

    for (const r of rows ?? []) {
        const pid = (r as { payment_id: string }).payment_id;
        const add = toIntCents((r as { allocated_amount_cents?: unknown }).allocated_amount_cents);
        out.set(pid, (out.get(pid) ?? 0) + add);
    }
    return out;
}
