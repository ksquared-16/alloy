import { NextResponse } from "next/server";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getInboundTestStatus } from "@/lib/communications/identity/admin/identityAdminService";

export async function GET(req: Request) {
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;
    const url = new URL(req.url);
    const identityId = url.searchParams.get("identity_id");
    const supabase = createAdminClient();
    const events = await getInboundTestStatus(supabase, ctx.orgId, identityId);
    return NextResponse.json({ recent_inbound_events: events });
}
