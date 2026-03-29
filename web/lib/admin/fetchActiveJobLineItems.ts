import type { SupabaseClient } from "@supabase/supabase-js";

const JOB_LINE_ITEM_ADMIN_SELECT =
    "id, line_type, label, description, quantity, unit_amount_cents, amount_cents, pricing_source, is_manual_override, manual_override_reason, metadata, is_active, sort_order, created_at";

/**
 * Active job_line_items for admin read paths (drawer, job page). Ordered by sort_order, then created_at.
 */
export async function fetchActiveJobLineItemsForAdmin(
    supabase: SupabaseClient,
    orgId: string,
    jobId: string
): Promise<Record<string, unknown>[]> {
    const { data, error } = await supabase
        .from("job_line_items")
        .select(JOB_LINE_ITEM_ADMIN_SELECT)
        .eq("job_id", jobId)
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });
    if (error) {
        console.warn("[fetchActiveJobLineItemsForAdmin]", error.message);
        return [];
    }
    return data ?? [];
}
