import type { SupabaseClient } from "@supabase/supabase-js";

function envInt(name: string, defaultVal: number): number {
    const raw = process.env[name]?.trim();
    if (raw == null || raw === "") return defaultVal;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : defaultVal;
}

/** Cents to charge when the late-cancel window applies (0 disables all cancellation fees). */
export function getCancellationFeeCents(): number {
    return Math.max(0, envInt("ALLOY_CANCELLATION_FEE_CENTS", 2500));
}

/**
 * V1 business rule: fee only if the schedule is canceled while `start_at` is still in the future
 * and the time until `start_at` is at most `windowHours` (default 24).
 *
 * No "always charge", no post-start window — only the simple late-cancel case.
 */
function isLateCancellationWithinWindow(
    visitStartAtIso: string | null | undefined,
    cancelTimeMs: number,
    windowHours: number
): boolean {
    if (!visitStartAtIso || !String(visitStartAtIso).trim()) return false;
    const startMs = Date.parse(String(visitStartAtIso));
    if (Number.isNaN(startMs)) return false;
    if (Number.isNaN(cancelTimeMs)) return false;

    const msUntilStart = startMs - cancelTimeMs;
    if (msUntilStart <= 0) {
        return false;
    }
    const hoursUntilStart = msUntilStart / (1000 * 60 * 60);
    return hoursUntilStart <= windowHours;
}

/** Hours-before-start threshold; invalid or non-positive values fall back to 24. */
function getCancellationFeeWindowHours(): number {
    const w = envInt("ALLOY_CANCELLATION_FEE_WITHIN_HOURS", 24);
    return w > 0 ? w : 24;
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

export type CancellationFeeChargeResult =
    | { ok: true; skipped: true; reason: string }
    | { ok: true; skipped: false; charge_id: string }
    | { ok: false; error: string };

/**
 * Idempotent per schedule: if a non-void `cancellation_fee` charge already has
 * `metadata.source_schedule_id` = this schedule, skip (no duplicate).
 */
export async function maybeCreateCancellationFeeCharge(params: {
    supabase: SupabaseClient;
    orgId: string;
    jobId: string;
    scheduleId: string;
    visitStartAt: string | null | undefined;
    /** Wall time of cancellation (use DB `canceled_at` from the cancel row when available). */
    canceledAtIso: string;
}): Promise<CancellationFeeChargeResult> {
    const { supabase, orgId, jobId, scheduleId } = params;
    const feeCents = getCancellationFeeCents();
    if (feeCents <= 0) {
        return { ok: true, skipped: true, reason: "fee_disabled" };
    }

    const cancelMs = Date.parse(params.canceledAtIso);
    const windowH = getCancellationFeeWindowHours();
    if (!isLateCancellationWithinWindow(params.visitStartAt, cancelMs, windowH)) {
        return { ok: true, skipped: true, reason: "outside_late_cancel_window" };
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
