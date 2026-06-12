import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";

/**
 * POST create an announcement DRAFT. DARK behind comms_v2_announcements. No send, no auto-delivery —
 * draft only; classification recorded. Audience resolution + delivery execution are a real-gate
 * follow-on (must run the consent gate per recipient). (PKG-18D)
 */
export async function POST(request: NextRequest) {
    if (!isCommsV2FlagEnabled("comms_v2_announcements")) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    let body: { title?: string; classification?: string | null; channel_set?: unknown };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }
    const title = String(body.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("announcements")
        .insert({
            org_id: ctx.orgId,
            title,
            classification: body.classification ?? null,
            channel_set: Array.isArray(body.channel_set) ? body.channel_set : [],
            status: "draft",
            created_by_user_id: ctx.userId,
        })
        .select("id")
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data?.id });
}
