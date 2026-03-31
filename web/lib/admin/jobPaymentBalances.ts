/**
 * Authoritative payment/balance reads for jobs.
 *
 * When the job has at least one **non-void** receivable in `charges`, totals use charge amounts +
 * `payment_allocations.charge_id` (plus legacy job-target rows with `charge_id` null). Otherwise
 * reads fall back to job_line_items / `jobs.total_cents` and job-targeted allocations only.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type PaymentAllocationState = "unallocated" | "partially_allocated" | "fully_allocated";

export type PaymentAllocationRollup = {
    allocated_amount_cents: number;
    unallocated_amount_cents: number;
    allocation_state: PaymentAllocationState;
};

export type JobChargeBalanceRow = {
    charge_id: string;
    /** service | fee | adjustment */
    charge_type: string;
    amount_cents: number;
    status: string;
    /** Sum of active allocations on this charge where parent payment is posted. */
    posted_allocated_cents: number;
    /** amount_cents − posted_allocated_cents (may be negative for credit adjustments). */
    outstanding_cents: number;
    service_date: string | null;
    due_date: string | null;
    /** Short description for admin UI (may be truncated). */
    description: string | null;
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
    /** True when `job_total_cents` and paid/pending splits used non-void `charges` + charge allocations. */
    receivable_source?: "charges" | "legacy_job";
    /** Non-void charges where outstanding (amount − posted alloc) is non-zero (charge read model only). */
    open_charge_count?: number;
    /** Per-charge breakdown when in charge read model (non-void charges only). */
    charge_balance_rows?: JobChargeBalanceRow[];
};

function toIntCents(v: unknown): number {
    const n = typeof v === "bigint" ? Number(v) : Number(v);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n);
}

type ChargeRowMinimal = {
    id: string;
    amount_cents: unknown;
    status: unknown;
    charge_type: unknown;
    service_date: unknown;
    due_date: unknown;
    description: unknown;
};

/** Non-void service/fee/adjustment charges for the job (receivable total). */
export async function fetchNonVoidChargesForJob(
    supabase: SupabaseClient,
    orgId: string,
    jobId: string
): Promise<ChargeRowMinimal[]> {
    const { data, error } = await supabase
        .from("charges")
        .select("id, amount_cents, status, charge_type, service_date, due_date, description")
        .eq("org_id", orgId)
        .eq("job_id", jobId)
        .neq("status", "void");

    if (error) {
        console.warn("[fetchNonVoidChargesForJob]:", error.message);
        return [];
    }
    return (data ?? []) as ChargeRowMinimal[];
}

export async function getNonVoidChargeIdsForJob(
    supabase: SupabaseClient,
    orgId: string,
    jobId: string
): Promise<string[]> {
    const rows = await fetchNonVoidChargesForJob(supabase, orgId, jobId);
    return rows.map((r) => r.id).filter(Boolean);
}

/** All charges for the job (including void) — payment discovery via charge-linked allocations. */
export async function getAllChargeIdsForJob(
    supabase: SupabaseClient,
    orgId: string,
    jobId: string
): Promise<string[]> {
    const { data, error } = await supabase.from("charges").select("id").eq("org_id", orgId).eq("job_id", jobId);
    if (error) {
        console.warn("[getAllChargeIdsForJob]:", error.message);
        return [];
    }
    return (data ?? []).map((r) => (r as { id: string }).id).filter(Boolean);
}

function jobUsesChargeReceivableModel(nonVoidCharges: ChargeRowMinimal[]): boolean {
    return nonVoidCharges.length > 0;
}

function sumNonVoidChargeAmountCents(charges: ChargeRowMinimal[]): number {
    let sum = 0;
    for (const c of charges) {
        sum += toIntCents(c.amount_cents);
    }
    return sum;
}

/**
 * Allocations that apply to this job's receivable reads when in charge mode:
 * - rows with `charge_id` on one of the job's non-void charges, or
 * - legacy rows with `charge_id` null and job target (avoids double-counting rows that have both).
 */
async function fetchActiveReceivableAllocRows(
    supabase: SupabaseClient,
    orgId: string,
    jobId: string,
    nonVoidChargeIds: string[]
): Promise<{ payment_id: string; allocated_amount_cents: unknown; charge_id: string | null }[]> {
    const legacyJob = await supabase
        .from("payment_allocations")
        .select("payment_id, allocated_amount_cents, charge_id")
        .eq("org_id", orgId)
        .eq("status", "active")
        .eq("target_entity_type", "job")
        .eq("target_entity_id", jobId)
        .is("charge_id", null);

    if (legacyJob.error) {
        console.warn("[fetchActiveReceivableAllocRows] legacy job:", legacyJob.error.message);
    }

    let chargeLinkedData: { payment_id: string; allocated_amount_cents: unknown; charge_id: string | null }[] = [];
    if (nonVoidChargeIds.length > 0) {
        const chargeLinked = await supabase
            .from("payment_allocations")
            .select("payment_id, allocated_amount_cents, charge_id")
            .eq("org_id", orgId)
            .eq("status", "active")
            .in("charge_id", nonVoidChargeIds);
        if (chargeLinked.error) {
            console.warn("[fetchActiveReceivableAllocRows] charge:", chargeLinked.error.message);
        } else {
            chargeLinkedData = (chargeLinked.data ?? []) as {
                payment_id: string;
                allocated_amount_cents: unknown;
                charge_id: string | null;
            }[];
        }
    }

    const a = (legacyJob.data ?? []) as { payment_id: string; allocated_amount_cents: unknown; charge_id: string | null }[];
    return [...a, ...chargeLinkedData];
}

async function sumAllocatedCentsForJobByParentPaymentStatus(
    supabase: SupabaseClient,
    orgId: string,
    jobId: string,
    nonVoidChargeIds: string[],
    paymentStatus: "posted" | "pending"
): Promise<number> {
    const rows = await fetchActiveReceivableAllocRows(supabase, orgId, jobId, nonVoidChargeIds);
    if (rows.length === 0) return 0;

    const paymentIds = [...new Set(rows.map((r) => r.payment_id))];
    const { data: statusRows, error: pErr } = await supabase
        .from("payments")
        .select("id")
        .eq("org_id", orgId)
        .in("id", paymentIds)
        .eq("status", paymentStatus);

    if (pErr) {
        console.warn("[sumAllocatedCentsForJobByParentPaymentStatus] payments:", pErr.message);
        return 0;
    }
    const allowed = new Set((statusRows ?? []).map((r) => (r as { id: string }).id));

    let sum = 0;
    for (const r of rows) {
        if (!allowed.has(r.payment_id)) continue;
        sum += toIntCents(r.allocated_amount_cents);
    }
    return sum;
}

async function sumPostedAllocatedByChargeId(
    supabase: SupabaseClient,
    orgId: string,
    chargeIds: string[]
): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    for (const id of chargeIds) out.set(id, 0);
    if (chargeIds.length === 0) return out;

    const { data: rows, error } = await supabase
        .from("payment_allocations")
        .select("payment_id, allocated_amount_cents, charge_id")
        .eq("org_id", orgId)
        .eq("status", "active")
        .in("charge_id", chargeIds);

    if (error) {
        console.warn("[sumPostedAllocatedByChargeId]:", error.message);
        return out;
    }
    const list = (rows ?? []) as { payment_id: string; allocated_amount_cents: unknown; charge_id: string }[];
    if (list.length === 0) return out;

    const paymentIds = [...new Set(list.map((r) => r.payment_id))];
    const { data: posted, error: pErr } = await supabase
        .from("payments")
        .select("id")
        .eq("org_id", orgId)
        .in("id", paymentIds)
        .eq("status", "posted");

    if (pErr) {
        console.warn("[sumPostedAllocatedByChargeId] payments:", pErr.message);
        return out;
    }
    const postedSet = new Set((posted ?? []).map((r) => (r as { id: string }).id));

    for (const r of list) {
        if (!postedSet.has(r.payment_id)) continue;
        const cid = r.charge_id;
        if (!cid) continue;
        const add = toIntCents(r.allocated_amount_cents);
        out.set(cid, (out.get(cid) ?? 0) + add);
    }
    return out;
}

function truncateDesc(s: string, max: number): string {
    const t = s.trim();
    if (t.length <= max) return t;
    return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function normalizeDateOnly(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s) return null;
    return s.length >= 10 ? s.slice(0, 10) : s;
}

function buildChargeBalanceRows(
    nonVoidCharges: ChargeRowMinimal[],
    postedByCharge: Map<string, number>
): { rows: JobChargeBalanceRow[]; open_charge_count: number } {
    const rows: JobChargeBalanceRow[] = [];
    let open = 0;
    for (const c of nonVoidCharges) {
        const amount = toIntCents(c.amount_cents);
        const postedAlloc = postedByCharge.get(c.id) ?? 0;
        const outstanding = amount - postedAlloc;
        const st = String(c.status ?? "").toLowerCase();
        const rawDesc = c.description != null && String(c.description).trim() ? String(c.description).trim() : null;
        rows.push({
            charge_id: c.id,
            charge_type: String(c.charge_type ?? "service").toLowerCase(),
            amount_cents: amount,
            status: st,
            posted_allocated_cents: postedAlloc,
            outstanding_cents: outstanding,
            service_date: normalizeDateOnly(c.service_date),
            due_date: normalizeDateOnly(c.due_date),
            description: rawDesc ? truncateDesc(rawDesc, 120) : null,
        });
        if (outstanding !== 0) open += 1;
    }
    return { rows, open_charge_count: open };
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

/** Payment ids linked to a job via allocations (job target), charge-linked allocations, or legacy payments.job_id. */
export async function getPaymentIdsForJob(supabase: SupabaseClient, orgId: string, jobId: string): Promise<string[]> {
    const chargeIds = await getAllChargeIdsForJob(supabase, orgId, jobId);

    const [allocRes, chargeAllocRes, legacyRes] = await Promise.all([
        supabase
            .from("payment_allocations")
            .select("payment_id")
            .eq("org_id", orgId)
            .eq("target_entity_type", "job")
            .eq("target_entity_id", jobId),
        chargeIds.length > 0
            ? supabase.from("payment_allocations").select("payment_id").eq("org_id", orgId).in("charge_id", chargeIds)
            : Promise.resolve({ data: [] as { payment_id?: string }[], error: null }),
        supabase.from("payments").select("id").eq("org_id", orgId).eq("job_id", jobId),
    ]);

    const ids = new Set<string>();
    for (const r of allocRes.data ?? []) {
        const pid = (r as { payment_id?: string }).payment_id;
        if (pid) ids.add(pid);
    }
    if (!chargeAllocRes.error) {
        for (const r of chargeAllocRes.data ?? []) {
            const pid = (r as { payment_id?: string }).payment_id;
            if (pid) ids.add(pid);
        }
    } else {
        console.warn("[getPaymentIdsForJob] charge allocations:", chargeAllocRes.error.message);
    }
    for (const r of legacyRes.data ?? []) {
        const id = (r as { id?: string }).id;
        if (id) ids.add(id);
    }
    return [...ids];
}

/**
 * Active allocations to this job whose parent payment is posted.
 * Uses charge read model when the job has non-void charges; otherwise job-targeted rows only (legacy).
 */
export async function getPostedAllocatedCentsForJob(
    supabase: SupabaseClient,
    orgId: string,
    jobId: string
): Promise<number> {
    const nonVoidCharges = await fetchNonVoidChargesForJob(supabase, orgId, jobId);
    const nonVoidIds = nonVoidCharges.map((c) => c.id);
    if (jobUsesChargeReceivableModel(nonVoidCharges)) {
        return sumAllocatedCentsForJobByParentPaymentStatus(supabase, orgId, jobId, nonVoidIds, "posted");
    }

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
 * Uses charge read model when the job has non-void charges; otherwise job-targeted rows only (legacy).
 */
export async function getPendingAllocatedCentsForJob(
    supabase: SupabaseClient,
    orgId: string,
    jobId: string
): Promise<number> {
    const nonVoidCharges = await fetchNonVoidChargesForJob(supabase, orgId, jobId);
    const nonVoidIds = nonVoidCharges.map((c) => c.id);
    if (jobUsesChargeReceivableModel(nonVoidCharges)) {
        return sumAllocatedCentsForJobByParentPaymentStatus(supabase, orgId, jobId, nonVoidIds, "pending");
    }

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
    const nonVoidCharges = await fetchNonVoidChargesForJob(supabase, orgId, jobId);
    const nonVoidIds = nonVoidCharges.map((c) => c.id);

    if (jobUsesChargeReceivableModel(nonVoidCharges)) {
        const job_total_cents = sumNonVoidChargeAmountCents(nonVoidCharges);
        const [paid_amount_cents, pending_payment_amount_cents, postedByCharge] = await Promise.all([
            sumAllocatedCentsForJobByParentPaymentStatus(supabase, orgId, jobId, nonVoidIds, "posted"),
            sumAllocatedCentsForJobByParentPaymentStatus(supabase, orgId, jobId, nonVoidIds, "pending"),
            sumPostedAllocatedByChargeId(supabase, orgId, nonVoidIds),
        ]);

        const outstanding_balance_cents =
            job_total_cents != null && Number.isFinite(job_total_cents)
                ? Math.max(0, Math.round(job_total_cents) - paid_amount_cents)
                : null;

        const { rows: charge_balance_rows, open_charge_count } = buildChargeBalanceRows(nonVoidCharges, postedByCharge);

        return {
            job_total_cents,
            paid_amount_cents,
            outstanding_balance_cents,
            pending_payment_amount_cents,
            receivable_source: "charges",
            open_charge_count,
            charge_balance_rows,
        };
    }

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
        receivable_source: "legacy_job",
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
    const nonVoidIds = await getNonVoidChargeIdsForJob(supabase, orgId, jobId);
    if (nonVoidIds.length > 0) {
        const [legacyJob, chargeLinked] = await Promise.all([
            supabase
                .from("payment_allocations")
                .select("allocated_amount_cents")
                .eq("org_id", orgId)
                .eq("payment_id", paymentId)
                .eq("status", "active")
                .eq("target_entity_type", "job")
                .eq("target_entity_id", jobId)
                .is("charge_id", null),
            supabase
                .from("payment_allocations")
                .select("allocated_amount_cents")
                .eq("org_id", orgId)
                .eq("payment_id", paymentId)
                .eq("status", "active")
                .in("charge_id", nonVoidIds),
        ]);
        if (legacyJob.error) console.warn("[getAllocatedAmountCentsForJob] legacy:", legacyJob.error.message);
        if (chargeLinked.error) console.warn("[getAllocatedAmountCentsForJob] charge:", chargeLinked.error.message);
        let sum = 0;
        for (const r of legacyJob.data ?? []) {
            sum += toIntCents((r as { allocated_amount_cents?: unknown }).allocated_amount_cents);
        }
        for (const r of chargeLinked.data ?? []) {
            sum += toIntCents((r as { allocated_amount_cents?: unknown }).allocated_amount_cents);
        }
        return sum;
    }

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

    const nonVoidIds = await getNonVoidChargeIdsForJob(supabase, orgId, jobId);

    if (nonVoidIds.length > 0) {
        const [legacyJob, chargeLinked] = await Promise.all([
            supabase
                .from("payment_allocations")
                .select("payment_id, allocated_amount_cents")
                .eq("org_id", orgId)
                .eq("status", "active")
                .eq("target_entity_type", "job")
                .eq("target_entity_id", jobId)
                .is("charge_id", null)
                .in("payment_id", paymentIds),
            supabase
                .from("payment_allocations")
                .select("payment_id, allocated_amount_cents")
                .eq("org_id", orgId)
                .eq("status", "active")
                .in("charge_id", nonVoidIds)
                .in("payment_id", paymentIds),
        ]);
        if (legacyJob.error) console.warn("[batchAllocatedCentsForJob] legacy:", legacyJob.error.message);
        if (chargeLinked.error) console.warn("[batchAllocatedCentsForJob] charge:", chargeLinked.error.message);
        for (const r of legacyJob.data ?? []) {
            const pid = (r as { payment_id: string }).payment_id;
            const add = toIntCents((r as { allocated_amount_cents?: unknown }).allocated_amount_cents);
            out.set(pid, (out.get(pid) ?? 0) + add);
        }
        for (const r of chargeLinked.data ?? []) {
            const pid = (r as { payment_id: string }).payment_id;
            const add = toIntCents((r as { allocated_amount_cents?: unknown }).allocated_amount_cents);
            out.set(pid, (out.get(pid) ?? 0) + add);
        }
        return out;
    }

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
