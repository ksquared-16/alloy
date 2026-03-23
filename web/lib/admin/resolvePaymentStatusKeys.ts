import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Map payments.payment_status_id (UUID) → lowercase logical key (e.g. pending, paid, failed).
 * Rows often omit denormalized payments.status_key and sometimes paid_at; the FK is canonical.
 */
export async function fetchPaymentStatusKeyByIdMap(
    supabase: SupabaseClient,
    statusIds: (string | null | undefined)[]
): Promise<Map<string, string>> {
    const unique = [...new Set(statusIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0))];
    if (unique.length === 0) return new Map();

    const { data, error } = await supabase.from("payment_statuses").select("id, key").in("id", unique);

    if (error) {
        console.warn("[fetchPaymentStatusKeyByIdMap] payment_statuses query failed:", error.message);
        return new Map();
    }

    const m = new Map<string, string>();
    for (const r of (data ?? []) as { id: string; key?: string | null }[]) {
        const raw = (r.key ?? "").toString().trim();
        if (!raw) continue;
        m.set(r.id, raw.toLowerCase());
    }
    return m;
}
