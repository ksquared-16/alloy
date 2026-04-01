import type { SupabaseClient } from "@supabase/supabase-js";

const ADJUSTMENT_REASON = "pricing_change" as const;

type PostedServiceRow = { id: string; amount_cents: number | string | bigint };

/**
 * Sum amounts of non-void service charges in posted / partially_paid / paid (immutable pricing state).
 */
async function sumPostedServiceChargeCents(
    supabase: SupabaseClient,
    orgId: string,
    jobId: string
): Promise<{ sum: number; error: string | null }> {
    const { data, error } = await supabase
        .from("charges")
        .select("id, amount_cents")
        .eq("org_id", orgId)
        .eq("job_id", jobId)
        .eq("charge_type", "service")
        .in("status", ["posted", "partially_paid", "paid"]);

    if (error) return { sum: 0, error: error.message };
    let sum = 0;
    for (const r of data ?? []) {
        const row = r as PostedServiceRow;
        const n = typeof row.amount_cents === "bigint" ? Number(row.amount_cents) : Number(row.amount_cents);
        if (Number.isFinite(n)) sum += Math.round(n);
    }
    return { sum, error: null };
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

async function deleteReplaceableDraftPricingAdjustments(
    supabase: SupabaseClient,
    orgId: string,
    jobId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
    const { data, error } = await supabase
        .from("charges")
        .select("id, metadata")
        .eq("org_id", orgId)
        .eq("job_id", jobId)
        .eq("charge_type", "adjustment")
        .eq("status", "draft");

    if (error) return { ok: false, error: error.message };

    const ids: string[] = [];
    for (const r of data ?? []) {
        const row = r as { id: string; metadata: unknown };
        const m = row.metadata;
        if (isRecord(m) && m["adjustment_reason"] === ADJUSTMENT_REASON) {
            ids.push(row.id);
        }
    }

    for (const chargeId of ids) {
        const { count, error: cErr } = await supabase
            .from("payment_allocations")
            .select("id", { count: "exact", head: true })
            .eq("charge_id", chargeId)
            .eq("status", "active");
        if (cErr) return { ok: false, error: cErr.message };
        if ((count ?? 0) > 0) {
            return {
                ok: false,
                error:
                    "A draft pricing-change adjustment already has payment allocations. Resolve or void it before changing pricing again.",
            };
        }
        const { error: dErr } = await supabase.from("charges").delete().eq("id", chargeId).eq("org_id", orgId);
        if (dErr) return { ok: false, error: dErr.message };
    }

    return { ok: true };
}

export type ApplyPricingDeltaAdjustmentResult = { ok: true; skipped: boolean; charge_id?: string } | { ok: false; error: string };

/**
 * When line-item pricing total diverges from posted service charge(s), insert a draft adjustment (positive or negative).
 * Does not mutate posted service rows. Removes prior unallocated draft pricing_change adjustments first.
 */
export async function applyPricingDeltaAdjustmentCharge(params: {
    supabase: SupabaseClient;
    orgId: string;
    jobId: string;
    /** Current job pricing total from line items (computeJobTotals.total_cents). */
    newPricingTotalCents: number;
}): Promise<ApplyPricingDeltaAdjustmentResult> {
    const { supabase, orgId, jobId } = params;
    const newTotal = Math.round(Number(params.newPricingTotalCents) || 0);

    const { sum: postedServiceSum, error: sumErr } = await sumPostedServiceChargeCents(supabase, orgId, jobId);
    if (sumErr) return { ok: false, error: sumErr };
    if (postedServiceSum <= 0) {
        return { ok: true, skipped: true };
    }

    const delta = newTotal - postedServiceSum;
    const del = await deleteReplaceableDraftPricingAdjustments(supabase, orgId, jobId);
    if (!del.ok) return { ok: false, error: del.error };

    if (delta === 0) {
        return { ok: true, skipped: true };
    }

    const now = new Date().toISOString();
    const { data: jobRow, error: jobErr } = await supabase
        .from("jobs")
        .select("scheduled_at")
        .eq("id", jobId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (jobErr) return { ok: false, error: jobErr.message };
    const scheduledAt = (jobRow as { scheduled_at?: string | null } | null)?.scheduled_at ?? null;
    const serviceDate = scheduledAt ? String(scheduledAt).slice(0, 10) : null;

    const description = delta > 0 ? "Adjustment — pricing change (increase)" : "Adjustment — pricing change (credit)";

    const { data: inserted, error: insErr } = await supabase
        .from("charges")
        .insert({
            org_id: orgId,
            job_id: jobId,
            schedule_id: null,
            subscription_id: null,
            source_charge_id: null,
            charge_type: "adjustment",
            status: "draft",
            currency_code: "USD",
            amount_cents: delta,
            service_date: serviceDate,
            due_date: serviceDate,
            posted_at: null,
            voided_at: null,
            description,
            metadata: {
                adjustment_reason: ADJUSTMENT_REASON,
                charge_source: "pricing_change",
                prior_posted_service_total_cents: postedServiceSum,
                new_pricing_total_cents: newTotal,
            },
            updated_at: now,
        })
        .select("id")
        .single();

    if (insErr) return { ok: false, error: insErr.message };
    const id = (inserted as { id: string }).id;
    return { ok: true, skipped: false, charge_id: id };
}
