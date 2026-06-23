import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { validateAnnouncementTargets } from "@/lib/communications/v2/announcementService";
import { resolveAudienceSpec, type ResolveTarget } from "@/lib/communications/v2/resolveAnnouncementAudience";
import { audiencePreviewResponse, resolveTargetsToSpec, type LegacyTargetRow } from "@/lib/communications/v2/audienceSpec";
import type { AnnouncementTargetType } from "@/lib/communications/v2/announcementSchema";

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

    // Targets: prefer validated targets from the body (preview the unsaved selection);
    // otherwise read the saved announcement_targets config.
    let targets: ResolveTarget[] = [];
    let body: unknown = null;
    try {
        body = await request.json();
    } catch {
        body = null;
    }
    const rawTargets = body && typeof body === "object" ? (body as Record<string, unknown>).targets : undefined;
    if (rawTargets !== undefined) {
        const parsed = validateAnnouncementTargets(rawTargets);
        if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
        // Carry rule so a 'custom' target's audience_spec resolves through the spec engine.
        targets = parsed.value.map((t) => ({ target_type: t.target_type, target_ref: t.target_ref, rule: t.rule }));
    } else {
        const { data: rows, error: tErr } = await supabase
            .from("announcement_targets")
            .select("target_type, target_ref, rule")
            .eq("org_id", orgId)
            .eq("announcement_id", id);
        if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
        targets = (rows ?? []).map((r) => {
            const row = r as { target_type: string; target_ref: string | null; rule: Record<string, unknown> | null };
            return { target_type: row.target_type as AnnouncementTargetType, target_ref: row.target_ref ?? null, rule: row.rule ?? null };
        });
    }

    // Resolve to a spec (custom row authoritative; missing/invalid → error, never all families).
    const specRes = resolveTargetsToSpec(targets as LegacyTargetRow[]);
    if (!specRes.ok) return NextResponse.json({ error: specRes.error }, { status: 400 });

    const preview = await resolveAudienceSpec(supabase, orgId, specRes.spec);
    return NextResponse.json(audiencePreviewResponse(preview));
}
