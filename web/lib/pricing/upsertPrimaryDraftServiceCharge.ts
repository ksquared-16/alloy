import type { SupabaseClient } from "@supabase/supabase-js";
import type { ComputedPricingTotals } from "@/lib/pricing/jobPricingCore";
type PricingLockSource = "book-v2" | "admin";

const CHARGE_SOURCE = "job_pricing_lock" as const;

export type UpsertPrimaryDraftServiceChargeResult =
    | { ok: true; skipped: true; reason: string }
    | { ok: true; skipped: false; charge_id: string; action: "inserted" | "updated" }
    | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

async function countActiveAllocationsForCharge(supabase: SupabaseClient, chargeId: string): Promise<number> {
    const { count, error } = await supabase
        .from("payment_allocations")
        .select("id", { count: "exact", head: true })
        .eq("charge_id", chargeId)
        .eq("status", "active");
    if (error) {
        console.warn("[upsertPrimaryDraftServiceCharge] allocation count:", error.message);
        return 0;
    }
    return count ?? 0;
}

function pickDraftToUpdate(
    drafts: { id: string; created_at: string | null; metadata: unknown }[]
): { id: string; created_at: string | null; metadata: unknown } | null {
    if (drafts.length === 0) return null;
    const primary = drafts.filter(
        (d) => isRecord(d.metadata) && d.metadata["primary_service_charge"] === true
    );
    const pool = primary.length > 0 ? primary : drafts;
    const sorted = [...pool].sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
    });
    return sorted[0] ?? null;
}

/**
 * After job pricing lock: one primary draft `service` charge, or update the existing
 * primary draft when safe. Skips when a posted/partially_paid/paid service charge already exists.
 */
export async function upsertPrimaryDraftServiceCharge(params: {
    supabase: SupabaseClient;
    orgId: string;
    jobId: string;
    totals: ComputedPricingTotals;
    source: PricingLockSource;
}): Promise<UpsertPrimaryDraftServiceChargeResult> {
    const { supabase, orgId, jobId, totals, source } = params;
    const amount = Math.round(Number(totals.total_cents) || 0);
    if (amount <= 0) {
        return { ok: true, skipped: true, reason: "zero_or_negative_total_cents" };
    }

    const { data: jobRow, error: jobErr } = await supabase
        .from("jobs")
        .select("scheduled_at")
        .eq("id", jobId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (jobErr) {
        return { ok: false, error: `job fetch for charge dates: ${jobErr.message}` };
    }
    const scheduledAt = (jobRow as { scheduled_at?: string | null } | null)?.scheduled_at ?? null;
    const serviceDate = scheduledAt ? String(scheduledAt).slice(0, 10) : null;
    const dueDate = serviceDate;

    const { data: chargeRows, error: chErr } = await supabase
        .from("charges")
        .select("id, status, metadata, created_at")
        .eq("org_id", orgId)
        .eq("job_id", jobId)
        .eq("charge_type", "service");
    if (chErr) {
        return { ok: false, error: `charges query: ${chErr.message}` };
    }

    const rows = (chargeRows ?? []) as { id: string; status: string; metadata: unknown; created_at: string | null }[];

    const blocking = rows.filter((r) =>
        ["posted", "partially_paid", "paid"].includes(String(r.status || "").toLowerCase())
    );
    if (blocking.length > 0) {
        return { ok: true, skipped: true, reason: "non_draft_service_charge_exists" };
    }

    const drafts = rows.filter((r) => String(r.status || "").toLowerCase() === "draft");
    const freeDrafts: typeof drafts = [];
    for (const d of drafts) {
        const n = await countActiveAllocationsForCharge(supabase, d.id);
        if (n === 0) freeDrafts.push(d);
    }

    const chosen = pickDraftToUpdate(freeDrafts);

    const baseMetadata: Record<string, unknown> = {
        primary_service_charge: true,
        charge_source: CHARGE_SOURCE,
        pricing_init_source: source,
    };

    const description = "Service charge (job pricing)";

    if (chosen) {
        const prevMeta = isRecord(chosen.metadata) ? { ...chosen.metadata } : {};
        const metadata = { ...prevMeta, ...baseMetadata };
        const { data: updated, error: upErr } = await supabase
            .from("charges")
            .update({
                amount_cents: amount,
                currency_code: "USD",
                service_date: serviceDate,
                due_date: dueDate ?? serviceDate,
                description,
                metadata,
                updated_at: new Date().toISOString(),
            })
            .eq("id", chosen.id)
            .eq("org_id", orgId)
            .eq("status", "draft")
            .select("id")
            .maybeSingle();
        if (upErr) {
            return { ok: false, error: `charges update: ${upErr.message}` };
        }
        if (!updated) {
            return { ok: false, error: "charges update: draft row no longer eligible (concurrent change?)" };
        }
        return { ok: true, skipped: false, charge_id: chosen.id, action: "updated" };
    }

    if (drafts.length > 0 && freeDrafts.length === 0) {
        return { ok: true, skipped: true, reason: "existing_drafts_have_active_allocations" };
    }

    const { data: inserted, error: insErr } = await supabase
        .from("charges")
        .insert({
            org_id: orgId,
            job_id: jobId,
            schedule_id: null,
            subscription_id: null,
            source_charge_id: null,
            charge_type: "service",
            status: "draft",
            currency_code: "USD",
            amount_cents: amount,
            service_date: serviceDate,
            due_date: dueDate ?? serviceDate,
            posted_at: null,
            voided_at: null,
            description,
            metadata: baseMetadata,
        })
        .select("id")
        .single();
    if (insErr) {
        return { ok: false, error: `charges insert: ${insErr.message}` };
    }
    const id = (inserted as { id: string }).id;
    return { ok: true, skipped: false, charge_id: id, action: "inserted" };
}
