import type { SupabaseClient } from "@supabase/supabase-js";

function envInt(name: string, defaultVal: number): number {
    const raw = process.env[name]?.trim();
    if (raw == null || raw === "") return defaultVal;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : defaultVal;
}

/** Cents to charge when cancellation policy applies (0 disables). */
export function getCancellationFeeCents(): number {
    return Math.max(0, envInt("ALLOY_CANCELLATION_FEE_CENTS", 2500));
}

/**
 * Simple policy: `always` (default) or `within_hours` (fee only if visit start is within N hours, or in the past 1h).
 */
export function shouldApplyCancellationFeePolicy(visitStartAtIso: string | null | undefined): boolean {
    if (getCancellationFeeCents() <= 0) return false;
    const policy = (process.env.ALLOY_CANCELLATION_FEE_POLICY || "always").trim().toLowerCase();
    if (policy === "always") return true;
    if (policy !== "within_hours") return true;

    const windowH = Math.max(0, envInt("ALLOY_CANCELLATION_FEE_WITHIN_HOURS", 24));
    if (!visitStartAtIso || !String(visitStartAtIso).trim()) return false;

    const startMs = Date.parse(String(visitStartAtIso));
    if (Number.isNaN(startMs)) return false;
    const now = Date.now();
    const hoursUntil = (startMs - now) / (1000 * 60 * 60);
    if (hoursUntil >= 0 && hoursUntil <= windowH) return true;
    if (hoursUntil < 0 && hoursUntil >= -1) return true;
    return false;
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

export type CancellationFeeChargeResult =
    | { ok: true; skipped: true; reason: string }
    | { ok: true; skipped: false; charge_id: string }
    | { ok: false; error: string };

/**
 * Idempotent: skips if a non-void cancellation_fee already exists for this schedule in metadata.
 */
export async function maybeCreateCancellationFeeCharge(params: {
    supabase: SupabaseClient;
    orgId: string;
    jobId: string;
    scheduleId: string;
    visitStartAt: string | null | undefined;
}): Promise<CancellationFeeChargeResult> {
    const { supabase, orgId, jobId, scheduleId } = params;
    const feeCents = getCancellationFeeCents();
    if (feeCents <= 0) {
        return { ok: true, skipped: true, reason: "fee_disabled" };
    }
    if (!shouldApplyCancellationFeePolicy(params.visitStartAt)) {
        return { ok: true, skipped: true, reason: "policy_not_met" };
    }

    const { data: existing, error: exErr } = await supabase
        .from("charges")
        .select("id, status, metadata")
        .eq("org_id", orgId)
        .eq("job_id", jobId)
        .eq("charge_type", "cancellation_fee");

    if (exErr) return { ok: false, error: exErr.message };

    for (const r of existing ?? []) {
        const row = r as { status: string; metadata: unknown };
        if (String(row.status).toLowerCase() === "void") continue;
        const m = row.metadata;
        if (isRecord(m) && m["source_schedule_id"] === scheduleId) {
            return { ok: true, skipped: true, reason: "already_exists_for_schedule" };
        }
    }

    const now = new Date().toISOString();
    const start = params.visitStartAt ? String(params.visitStartAt).slice(0, 10) : null;

    const { data: inserted, error: insErr } = await supabase
        .from("charges")
        .insert({
            org_id: orgId,
            job_id: jobId,
            schedule_id: scheduleId,
            subscription_id: null,
            source_charge_id: null,
            charge_type: "cancellation_fee",
            status: "draft",
            currency_code: "USD",
            amount_cents: feeCents,
            service_date: start,
            due_date: start,
            posted_at: null,
            voided_at: null,
            description: "Cancellation fee",
            metadata: {
                reason: "cancellation",
                fee_reason: "cancellation",
                source_schedule_id: scheduleId,
                charge_source: "schedule_cancellation",
            },
            updated_at: now,
        })
        .select("id")
        .single();

    if (insErr) return { ok: false, error: insErr.message };
    return { ok: true, skipped: false, charge_id: (inserted as { id: string }).id };
}
