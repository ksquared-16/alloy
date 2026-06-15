import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import { aggregateDeliverability } from "@/lib/communications/v2/deliverability";

/**
 * GET /api/admin/communications/deliverability — org-wide delivery metrics from delivery events.
 * DARK: gated behind comms_v2_deliverability (404 when off). Read-only; no send, no mutation. (PKG-16)
 */
export async function GET() {
    if (!isCommsV2FlagEnabled("comms_v2_deliverability")) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("communication_delivery_events")
        .select("event_type")
        .eq("org_id", ctx.orgId)
        .order("occurred_at", { ascending: false })
        .limit(5000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ metrics: aggregateDeliverability(data ?? []) });
}
