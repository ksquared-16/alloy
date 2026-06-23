import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { cancelScheduledAnnouncement } from "@/lib/communications/v2/scheduleAnnouncementSendout";

/**
 * Communications V2 — cancel a scheduled announcement (Phase 1 / B7).
 * scheduled → draft; cascade-cancels child communication_scheduled_sends (pending/claimed)
 * and clears the recipient snapshot. No send, no provider. Org scoped.
 */

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** POST …/announcements/[id]/cancel */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid announcement id" }, { status: 400 });

    const supabase = createAdminClient();
    const result = await cancelScheduledAnnouncement(supabase, ctx.orgId, id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ canceled: true });
}
