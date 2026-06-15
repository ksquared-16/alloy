import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import { TEMPLATE_APPROVAL_STATUSES } from "@/lib/communications/v2/templatesAnnouncements";

/** PATCH template approval/metadata. DARK behind comms_v2_templates. No send. (PKG-18D) */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    if (!isCommsV2FlagEnabled("comms_v2_templates")) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    const { id } = await context.params;
    let body: { approval_status?: string; name?: string; category?: string | null };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.approval_status !== undefined) {
        if (!(TEMPLATE_APPROVAL_STATUSES as readonly string[]).includes(body.approval_status)) {
            return NextResponse.json({ error: "invalid approval_status" }, { status: 400 });
        }
        patch.approval_status = body.approval_status;
    }
    if (body.name !== undefined) patch.name = String(body.name).trim();
    if (body.category !== undefined) patch.category = body.category;
    const supabase = createAdminClient();
    const { error } = await supabase.from("communication_templates").update(patch).eq("org_id", ctx.orgId).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
