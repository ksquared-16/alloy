import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import { TEMPLATE_CHANNELS } from "@/lib/communications/v2/templatesAnnouncements";

/** GET list / POST create communication templates. DARK behind comms_v2_templates. No send. (PKG-18D) */
export async function GET() {
    if (!isCommsV2FlagEnabled("comms_v2_templates")) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("communication_templates")
        .select("id,name,channel,category,approval_status,updated_at")
        .eq("org_id", ctx.orgId)
        .order("updated_at", { ascending: false })
        .limit(500);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ templates: data ?? [] });
}

export async function POST(request: NextRequest) {
    if (!isCommsV2FlagEnabled("comms_v2_templates")) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    let body: { name?: string; channel?: string; category?: string | null };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }
    const name = String(body.name ?? "").trim();
    const channel = String(body.channel ?? "");
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    if (!(TEMPLATE_CHANNELS as readonly string[]).includes(channel)) {
        return NextResponse.json({ error: "invalid channel" }, { status: 400 });
    }
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("communication_templates")
        .insert({ org_id: ctx.orgId, name, channel, category: body.category ?? null, approval_status: "draft", created_by_user_id: ctx.userId })
        .select("id")
        .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: data?.id });
}
