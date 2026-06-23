import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { validateAnnouncementTargets } from "@/lib/communications/v2/announcementService";

/**
 * Communications V2 — announcement target CONFIG (Phase 1 / B5).
 * Replaces the announcement_targets rows for one announcement (segment definition).
 * This is target CONFIG only — NOT recipient snapshots, NO audience resolution,
 * NO send, NO schedule, NO provider. Pattern: requireAdminOrOps -> ctx -> client; org scoped.
 */

const UUID_RE = /^[0-9a-f-]{36}$/i;
const TARGET_COLS = "id, target_type, target_ref, rule, created_at";

/** GET …/announcements/[id]/targets — current target config. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid announcement id" }, { status: 400 });

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("announcement_targets")
        .select(TARGET_COLS)
        .eq("org_id", ctx.orgId)
        .eq("announcement_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ targets: data ?? [] });
}

/** PUT …/announcements/[id]/targets — replace the target config set (draft segment definition). */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const parsed = validateAnnouncementTargets((body as Record<string, unknown>)?.targets);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const supabase = createAdminClient();
    const orgId = ctx.orgId;

    // Confirm the announcement exists in this org before touching its targets.
    const { data: ann, error: aErr } = await supabase
        .from("announcements")
        .select("id")
        .eq("id", id)
        .eq("org_id", orgId)
        .maybeSingle();
    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });
    if (!ann) return NextResponse.json({ error: "Announcement not found" }, { status: 404 });

    // Replace the config set (org + announcement scoped).
    const { error: delErr } = await supabase
        .from("announcement_targets")
        .delete()
        .eq("org_id", orgId)
        .eq("announcement_id", id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    if (parsed.value.length > 0) {
        const rows = parsed.value.map((t) => ({
            org_id: orgId,
            announcement_id: id,
            target_type: t.target_type,
            target_ref: t.target_ref,
            rule: t.rule,
        }));
        const { error: insErr } = await supabase.from("announcement_targets").insert(rows);
        if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    const { data: targets, error: selErr } = await supabase
        .from("announcement_targets")
        .select(TARGET_COLS)
        .eq("org_id", orgId)
        .eq("announcement_id", id);
    if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });

    return NextResponse.json({ targets: targets ?? [] });
}
