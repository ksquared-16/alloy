import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";

const RECENT_CAP = 300;

/**
 * GET /api/admin/communications/unread-count — inbound messages in org without a read row for current user (bounded scan).
 */
export async function GET() {
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;

    const supabase = createAdminClient();

    const { data: inbound, error: iErr } = await supabase
        .from("communication_messages")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(RECENT_CAP);

    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

    const ids = (inbound ?? []).map((r) => String((r as { id: string }).id)).filter(Boolean);
    if (ids.length === 0) {
        return NextResponse.json({ unread_count: 0 });
    }

    const { data: reads, error: rErr } = await supabase
        .from("communication_message_reads")
        .select("message_id")
        .eq("user_id", ctx.userId)
        .in("message_id", ids);

    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

    const readSet = new Set((reads ?? []).map((x) => String((x as { message_id: string }).message_id)));
    const unread = ids.filter((id) => !readSet.has(id)).length;

    return NextResponse.json({ unread_count: unread });
}
