import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { isAnnouncementStatus } from "@/lib/communications/v2/announcementSchema";
import { validateCreateAnnouncementInput } from "@/lib/communications/v2/announcementService";

/**
 * Communications V2 — announcement list + create (Phase 1 / B4 skeleton).
 * Draft-only CRUD. NO schedule, NO send, NO fan-out, NO provider.
 * Pattern: requireAdminOrOps -> getAdminContextCached -> createAdminClient; org_id scoped.
 */

const ANNOUNCEMENT_COLS =
    "id, org_id, created_by, title, status, channels, template_id, subject, body, body_format, send_at, sent_at, archived_at, created_at, updated_at";

/** GET /api/admin/communications/announcements — list org announcements (optional status filter). */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { searchParams } = new URL(request.url);
    const statusRaw = (searchParams.get("status") ?? "").trim();
    if (statusRaw && !isAnnouncementStatus(statusRaw)) {
        return NextResponse.json({ error: `invalid status filter '${statusRaw}'` }, { status: 400 });
    }
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 100, 1), 200);

    const supabase = createAdminClient();
    let query = supabase
        .from("announcements")
        .select(ANNOUNCEMENT_COLS)
        .eq("org_id", ctx.orgId)
        .order("updated_at", { ascending: false })
        .limit(limit);
    if (statusRaw) query = query.eq("status", statusRaw);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ announcements: data ?? [] });
}

/** POST /api/admin/communications/announcements — create a DRAFT announcement. */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = validateCreateAnnouncementInput(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const input = parsed.value;

    const supabase = createAdminClient();
    const { data: created, error } = await supabase
        .from("announcements")
        .insert({
            org_id: ctx.orgId,
            created_by: ctx.userId,
            title: input.title,
            status: "draft",
            channels: input.channels,
            subject: input.subject,
            body: input.body,
            body_format: input.body_format,
        })
        .select(ANNOUNCEMENT_COLS)
        .single();
    if (error || !created) {
        return NextResponse.json({ error: error?.message ?? "Failed to create announcement" }, { status: 500 });
    }

    return NextResponse.json({ announcement: created }, { status: 201 });
}
