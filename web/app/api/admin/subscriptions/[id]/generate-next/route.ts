import { NextResponse } from "next/server";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAuthCached, requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { generateNextSubscriptionSchedule } from "@/lib/admin/generateNextSubscriptionSchedule";

export async function POST(
    _request: Request,
    context: { params: Promise<{ id: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const auth = await getAdminAuthCached();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: subscriptionId } = await context.params;
    if (!subscriptionId) return NextResponse.json({ error: "Missing subscription id" }, { status: 400 });

    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "customer_subscriptions", subscriptionId, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }
    const result = await generateNextSubscriptionSchedule(supabase, subscriptionId);
    if (!result.ok) {
        if (result.code === "not_found") {
            return NextResponse.json({ error: result.error }, { status: 404 });
        }
        if (result.code === "no_anchor" || result.code === "no_job") {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }
        return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, schedule_id: result.schedule_id });
}
