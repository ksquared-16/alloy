import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import type { BillingCadence } from "@/lib/commercial/billingCadences";

/**
 * GET /api/admin/commercial/billing-cadences
 * Returns active billing cadence option set items for the org.
 */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            { error: ctx.status === 401 ? "Unauthorized" : "Forbidden" },
            { status: ctx.status }
        );
    }

    const supabase = createAdminClient();

    const { data: setRow, error: setErr } = await supabase
        .from("option_sets")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("set_key", "commercial_billing_cadence")
        .maybeSingle();

    if (setErr || !setRow) {
        // Option set not seeded yet — return empty (migration may not have run)
        return NextResponse.json({ cadences: [] });
    }

    const { data: items, error: itemsErr } = await supabase
        .from("option_set_items")
        .select("id, item_key, label, sort_order, metadata")
        .eq("option_set_id", setRow.id)
        .order("sort_order")
        .order("label");

    if (itemsErr) {
        return NextResponse.json({ error: itemsErr.message }, { status: 500 });
    }

    const cadences: BillingCadence[] = (items ?? []).map((item) => ({
        id: String(item.id),
        item_key: String(item.item_key),
        label: String(item.label),
        sort_order: Number(item.sort_order ?? 0),
        metadata:
            item.metadata != null && typeof item.metadata === "object" && !Array.isArray(item.metadata)
                ? (item.metadata as Record<string, unknown>)
                : {},
    }));

    return NextResponse.json({ cadences });
}
