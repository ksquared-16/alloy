import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * POST /api/admin/communications/messages/mark-read — per-user read receipts (inbound operator UX).
 */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const rawIds = body.message_ids;
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
        return NextResponse.json({ error: "message_ids array required" }, { status: 400 });
    }

    const ids = rawIds.map((x) => String(x).trim()).filter((id) => UUID_RE.test(id));
    if (ids.length === 0) {
        return NextResponse.json({ error: "No valid message UUIDs" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const now = new Date().toISOString();

    const { data: rows, error: qErr } = await supabase
        .from("communication_messages")
        .select("id, org_id, direction")
        .in("id", ids)
        .eq("org_id", ctx.orgId);

    if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });

    const allowed = (rows ?? []).filter((r) => (r as { direction?: string }).direction === "inbound").map((r) => String((r as { id: string }).id));

    if (allowed.length === 0) {
        return NextResponse.json({ ok: true, inserted: 0 });
    }

    const upserts = allowed.map((message_id) => ({
        org_id: ctx.orgId,
        message_id,
        user_id: ctx.userId,
        read_at: now,
    }));

    const { error: insErr } = await supabase.from("communication_message_reads").upsert(upserts, {
        onConflict: "message_id,user_id",
    });

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, inserted: upserts.length });
}
