import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";

/**
 * GET /api/admin/communications/unread-count — inbound messages with no read row for this user.
 *
 * This used to fetch the 300 most recent inbound ids, fetch read rows for them,
 * and count the difference in JavaScript. Past 300 unread it silently
 * under-reported: an operator returning to a busy tenant was told they had 300
 * unread replies when they had more, and the number stopped moving as the backlog
 * grew — worst exactly when it mattered most.
 *
 * The count is now an aggregate the database performs, so it is exact at any
 * size and costs one round trip instead of two. `communication_message_reads` is
 * keyed PRIMARY KEY (message_id, user_id), so the anti-join has an exact index.
 */
export async function GET() {
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;

    const supabase = createAdminClient();

    const { data, error } = await supabase.rpc("communication_unread_count", {
        p_org_id: ctx.orgId,
        p_user_id: ctx.userId,
    });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // The function returns a bigint, which arrives as a number or a numeric
    // string depending on driver. Normalising here keeps the contract stable.
    const unread = typeof data === "number" ? data : Number(data ?? 0);
    return NextResponse.json({ unread_count: Number.isFinite(unread) ? unread : 0 });
}
