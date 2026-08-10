import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { withoutSupersededDuplicates } from "@/lib/communications/supersededDuplicateMessages";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** GET /api/admin/communications/threads/[threadId]/messages */
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ threadId: string }> }
) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { threadId } = await context.params;
    if (!threadId || !UUID_RE.test(threadId)) {
        return NextResponse.json({ error: "Invalid threadId" }, { status: 400 });
    }

    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit")) || 60, 1), 200);
    const includeViewerRead = request.nextUrl.searchParams.get("include_viewer_read") === "1";

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
            "id, created_at, direction, channel, status, body, from_address, to_address, provider, sent_at, provider_message_id, metadata, delivered_at"
        )
        .eq("thread_id", threadId)
        .eq("org_id", ctx.orgId)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

    // Duplicate provider deliveries recorded before inbound uniqueness existed are
    // kept as history but must not read as the parent having said the same thing
    // twice. Excluded from presentation, never deleted.
    let list = withoutSupersededDuplicates((msgs ?? []) as Record<string, unknown>[]);
    if (includeViewerRead && ctx.userId && list.length > 0) {
        const ids = list.map((m) => String(m.id ?? "")).filter((id) => UUID_RE.test(id));
        const { data: reads, error: rErr } = await supabase
            .from("communication_message_reads")
            .select("message_id")
            .eq("user_id", ctx.userId)
            .in("message_id", ids);
        if (!rErr) {
            const readSet = new Set((reads ?? []).map((r) => String((r as { message_id: string }).message_id)));
            list = list.map((m) => {
                const dir = String(m.direction ?? "").toLowerCase();
                const id = String(m.id ?? "");
                const viewer_has_read = dir !== "inbound" || readSet.has(id);
                return { ...m, viewer_has_read };
            });
        }
    }

    return NextResponse.json({ messages: list });
}
