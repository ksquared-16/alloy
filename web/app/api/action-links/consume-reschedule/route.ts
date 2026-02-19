import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * POST /api/action-links/consume-reschedule
 * Body: { token, start_at, end_at, timezone? }
 * Verifies token is valid + not consumed + not expired, then:
 * - Sets action_links.consumed_at
 * - Updates schedule (entity_id = schedule_id) start_at, end_at, updated_at
 * Returns { ok: true, start_at, end_at } or error.
 */
export async function POST(request: NextRequest) {
    let body: { token?: string; start_at?: string; end_at?: string; timezone?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const token = body.token != null ? String(body.token).trim() : null;
    const startAt = body.start_at != null ? String(body.start_at).trim() : null;
    const endAt = body.end_at != null ? String(body.end_at).trim() : null;

    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
    if (!startAt || !endAt) return NextResponse.json({ error: "Missing start_at or end_at" }, { status: 400 });
    if (new Date(endAt) <= new Date(startAt)) {
        return NextResponse.json({ error: "end_at must be after start_at" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: row, error: fetchErr } = await supabase
        .from("action_links")
        .select("id, action_type, entity_type, entity_id, consumed_at, expires_at")
        .eq("token", token)
        .single();

    if (fetchErr || !row) {
        return NextResponse.json({ error: "Invalid or not found" }, { status: 404 });
    }

    const r = row as {
        id: string;
        action_type: string;
        entity_type: string;
        entity_id: string;
        consumed_at: string | null;
        expires_at: string;
    };

    if (r.consumed_at) {
        return NextResponse.json({ error: "Already used" }, { status: 410 });
    }
    if (new Date(r.expires_at) <= new Date()) {
        return NextResponse.json({ error: "Expired" }, { status: 410 });
    }
    if (r.action_type !== "customer_reschedule" || r.entity_type !== "schedule") {
        return NextResponse.json({ error: "Action not valid for reschedule" }, { status: 400 });
    }

    const scheduleId = r.entity_id;

    const { error: consumeErr } = await supabase
        .from("action_links")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", r.id);

    if (consumeErr) {
        return NextResponse.json({ error: "Failed to mark link used" }, { status: 500 });
    }

    const timezone = body.timezone != null ? String(body.timezone).trim() || undefined : undefined;
    const durationMs = new Date(endAt).getTime() - new Date(startAt).getTime();
    const durationMinutes = Math.round(durationMs / 60000);
    const scheduleUpdate: Record<string, unknown> = {
        start_at: startAt,
        end_at: endAt,
        duration_minutes: durationMinutes > 0 ? durationMinutes : undefined,
    };
    if (timezone) scheduleUpdate.timezone = timezone;

    const { data: schedule, error: updateErr } = await supabase
        .from("schedules")
        .update(scheduleUpdate)
        .eq("id", scheduleId)
        .select("start_at, end_at")
        .single();

    if (updateErr || !schedule) {
        return NextResponse.json({ error: "Failed to update schedule" }, { status: 500 });
    }

    const out = schedule as { start_at: string; end_at: string };
    return NextResponse.json({
        ok: true,
        start_at: out.start_at,
        end_at: out.end_at,
    });
}
