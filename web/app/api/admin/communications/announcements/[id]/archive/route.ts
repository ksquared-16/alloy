import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * Communications V2 — announcement archive (Phase 1 / B4 skeleton).
 * Soft archive: status='archived' + archived_at. No delete, no send, no provider.
 * Pattern: requireAdminOrOps -> getAdminContextCached -> createAdminClient; org_id scoped.
 */

const UUID_RE = /^[0-9a-f-]{36}$/i;
const ANNOUNCEMENT_COLS =
    "id, org_id, created_by, title, status, channels, template_id, subject, body, body_format, send_at, sent_at, archived_at, created_at, updated_at";

/** POST /api/admin/communications/announcements/[id]/archive — set status='archived'. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid announcement id" }, { status: 400 });

    const now = new Date().toISOString();
    const supabase = createAdminClient();

    const { data: updated, error } = await supabase
        .from("announcements")
        .update({ status: "archived", archived_at: now, updated_at: now })
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .select(ANNOUNCEMENT_COLS)
        .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!updated) return NextResponse.json({ error: "Announcement not found" }, { status: 404 });

    return NextResponse.json({ announcement: updated });
}
