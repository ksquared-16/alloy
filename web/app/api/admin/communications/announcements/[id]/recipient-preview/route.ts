import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    mapSavedAnnouncementTargets,
    runAnnouncementRecipientPreview,
} from "@/lib/communications/v2/runAnnouncementRecipientPreview";

/**
 * Communications V2 — announcement recipient preview (Phase 1 / B6 → B8D).
 * READ-ONLY: resolves the audience SPEC (rule.audience_spec for a 'custom' target; legacy
 * typed rows adapt as fallback) into the audience-spec preview shape (grain, matched_families,
 * matched_children, total_recipients, counts_by_channel, per_filter, sample, capped).
 * A custom row missing/invalid rule.audience_spec → 400 (never broadens to all families).
 * NO writes, NO send, NO schedule, NO provider. Pattern: requireAdminOrOps -> ctx -> client; org scoped.
 */

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** POST …/announcements/[id]/recipient-preview — count-only audience resolution. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id } = await params;
    if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid announcement id" }, { status: 400 });

    const supabase = createAdminClient();
    const orgId = ctx.orgId;

    // Confirm the announcement exists in this org (read-only).
    const { data: ann, error: aErr } = await supabase
        .from("announcements")
        .select("id")
        .eq("id", id)
        .eq("org_id", orgId)
        .maybeSingle();
    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });
    if (!ann) return NextResponse.json({ error: "Announcement not found" }, { status: 404 });

    let body: unknown = null;
    try {
        body = await request.json();
    } catch {
        body = null;
    }

    const rawTargets = body && typeof body === "object" ? (body as Record<string, unknown>).targets : undefined;
    if (rawTargets !== undefined) {
        const result = await runAnnouncementRecipientPreview(supabase, orgId, body);
        if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
        return NextResponse.json(result.preview);
    }

    const { data: rows, error: tErr } = await supabase
        .from("announcement_targets")
        .select("target_type, target_ref, rule")
        .eq("org_id", orgId)
        .eq("announcement_id", id);
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

    const targets = mapSavedAnnouncementTargets(
        (rows ?? []) as Array<{ target_type: string; target_ref: string | null; rule: Record<string, unknown> | null }>
    );
    const result = await runAnnouncementRecipientPreview(supabase, orgId, { targets });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.preview);
}
