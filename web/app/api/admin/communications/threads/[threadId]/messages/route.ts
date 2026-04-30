import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContext } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** GET /api/admin/communications/threads/[threadId]/messages */
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ threadId: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContext();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { threadId } = await context.params;
    if (!threadId || !UUID_RE.test(threadId)) {
        return NextResponse.json({ error: "Invalid threadId" }, { status: 400 });
    }

    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit")) || 60, 1), 200);

    const supabase = createAdminClient();

    const { data: thr, error: thrErr } = await supabase
        .from("communication_threads")
        .select("id, org_id")
        .eq("id", threadId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (thrErr || !thr) {
        return NextResponse.json({ error: thrErr?.message ?? "Thread not found" }, { status: 404 });
    }

    const { data: msgs, error: mErr } = await supabase
        .from("communication_messages")
        .select(
            "id, created_at, direction, channel, status, body, from_address, to_address, provider, sent_at"
        )
        .eq("thread_id", threadId)
        .eq("org_id", ctx.orgId)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

    return NextResponse.json({ messages: msgs ?? [] });
}
