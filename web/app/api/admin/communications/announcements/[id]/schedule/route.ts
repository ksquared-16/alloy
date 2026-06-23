import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { scheduleAnnouncement } from "@/lib/communications/v2/scheduleAnnouncementSendout";

/**
 * Communications V2 — schedule an announcement (Phase 1 / B7).
 * draft → scheduled at send_at; writes the recipient snapshot + fan-out execution rows
 * into the SHARED communication_scheduled_sends spine. Email/SMS without a binding →
 * skipped/provider_unavailable. In-app → operator-side only. Actual provider send is
 * gated off (Phase 3). Pattern: requireAdminOrOps -> ctx -> client; org scoped.
 */

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** POST …/announcements/[id]/schedule — body: { send_at: ISO } */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid announcement id" }, { status: 400 });

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const sendAt = typeof body.send_at === "string" ? body.send_at : "";
    if (!sendAt) return NextResponse.json({ error: "send_at (ISO timestamp) is required" }, { status: 400 });

    const supabase = createAdminClient();
    const result = await scheduleAnnouncement(supabase, ctx.orgId, ctx.userId, id, sendAt);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ scheduled: true, summary: result.summary });
}
