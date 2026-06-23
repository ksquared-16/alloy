import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { validatePatchAnnouncementInput } from "@/lib/communications/v2/announcementService";

/**
 * Communications V2 — announcement fetch + metadata update (Phase 1 / B4 skeleton).
 * Metadata-only PATCH (draft editing). NO status transitions, NO schedule, NO send.
 * Pattern: requireAdminOrOps -> getAdminContextCached -> createAdminClient; org_id scoped.
 */

const UUID_RE = /^[0-9a-f-]{36}$/i;
const ANNOUNCEMENT_COLS =
    "id, org_id, created_by, title, status, channels, template_id, subject, body, body_format, send_at, sent_at, archived_at, created_at, updated_at";

/** GET /api/admin/communications/announcements/[id] — announcement + its targets. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid announcement id" }, { status: 400 });

    const supabase = createAdminClient();
    const orgId = ctx.orgId;

    const { data: announcement, error } = await supabase
        .from("announcements")
        .select(ANNOUNCEMENT_COLS)
        .eq("id", id)
        .eq("org_id", orgId)
        .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!announcement) return NextResponse.json({ error: "Announcement not found" }, { status: 404 });

    const { data: targets, error: tErr } = await supabase
        .from("announcement_targets")
        .select("id, target_type, target_ref, rule, created_at")
        .eq("org_id", orgId)
        .eq("announcement_id", id);
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

    return NextResponse.json({ announcement, targets: targets ?? [] });
}

/** PATCH /api/admin/communications/announcements/[id] — edit draft metadata only. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid announcement id" }, { status: 400 });

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = validatePatchAnnouncementInput(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const patch = parsed.value;

    const supabase = createAdminClient();
    const orgId = ctx.orgId;

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) update.title = patch.title;
    if (patch.channels !== undefined) update.channels = patch.channels;
    if (patch.subject !== undefined) update.subject = patch.subject;
    if (patch.body !== undefined) update.body = patch.body;
    if (patch.body_format !== undefined) update.body_format = patch.body_format;
    if (patch.template_id !== undefined) update.template_id = patch.template_id;

    const { data: updated, error } = await supabase
        .from("announcements")
        .update(update)
        .eq("id", id)
        .eq("org_id", orgId)
        .select(ANNOUNCEMENT_COLS)
        .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!updated) return NextResponse.json({ error: "Announcement not found" }, { status: 404 });

    return NextResponse.json({ announcement: updated });
}
