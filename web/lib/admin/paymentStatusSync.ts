import type { SupabaseClient } from "@supabase/supabase-js";

/** DB constraint `payments_status_chk` — keep in sync with `status_key` writes. */
export type PaymentAppStatus = "pending" | "posted" | "failed" | "voided";

const PAID_LIKE = new Set(["paid", "completed", "succeeded", "posted"]);
const FAILED_LIKE = new Set(["failed", "failure", "declined"]);
const VOID_LIKE = new Set(["voided", "void", "canceled", "cancelled"]);

/**
 * Map a payments.status_key (and definition keys) to the constrained `payments.status` lifecycle value.
 * Mirrors backfill CASE in `20260329210000_payments_payment_allocations.sql`.
 */
export function paymentAppStatusFromStatusKey(statusKey: string | null | undefined): PaymentAppStatus {
    const raw = String(statusKey ?? "").trim().toLowerCase();
    if (!raw) return "pending";
    if (PAID_LIKE.has(raw)) return "posted";
    if (FAILED_LIKE.has(raw)) return "failed";
    if (VOID_LIKE.has(raw)) return "voided";
    return "pending";
}

export async function resolvePaymentStatusIdByKey(
    supabase: SupabaseClient,
    statusKey: string | null | undefined
): Promise<string | null> {
    const k = String(statusKey ?? "").trim().toLowerCase();
    if (!k) return null;
    const { data, error } = await supabase.from("payment_statuses").select("id").eq("key", k).maybeSingle();
    if (error || !data) return null;
    const id = (data as { id?: string }).id;
    return id && String(id).trim() ? String(id) : null;
}

type PaymentRowLite = {
    status?: string | null;
    paid_at?: string | null;
    posted_at?: string | null;
    failed_at?: string | null;
    voided_at?: string | null;
};

const nowIso = () => new Date().toISOString();

/**
 * Fields to merge into `payments.update` so `status_key`, `payment_status_id`, and `status` stay aligned.
 * Adjusts lifecycle timestamps to satisfy CHECK constraints when the lifecycle category changes.
 */
export function paymentRowFieldsForStatusKeyChange(
    newStatusKey: string | null,
    paymentStatusId: string | null,
    previous: PaymentRowLite
): Record<string, unknown> {
    const app = paymentAppStatusFromStatusKey(newStatusKey);
    const prev = String(previous.status ?? "pending").toLowerCase() as PaymentAppStatus;
    const out: Record<string, unknown> = {
        status_key: newStatusKey != null && String(newStatusKey).trim() !== "" ? String(newStatusKey).trim() : null,
        payment_status_id: paymentStatusId,
        status: app,
    };

    if (app === prev) {
        return out;
    }

    if (app === "pending") {
        out.paid_at = null;
        out.posted_at = null;
        out.failed_at = null;
        out.voided_at = null;
        return out;
    }
    if (app === "posted") {
        const ts = previous.paid_at ?? previous.posted_at ?? nowIso();
        out.paid_at = ts;
        out.posted_at = ts;
        out.failed_at = null;
        out.voided_at = null;
        return out;
    }
    if (app === "failed") {
        out.failed_at = previous.failed_at ?? nowIso();
        out.paid_at = null;
        out.posted_at = null;
        out.voided_at = null;
        return out;
    }
    /* voided */
    out.voided_at = previous.voided_at ?? nowIso();
    out.paid_at = null;
    out.posted_at = null;
    out.failed_at = null;
    return out;
}
