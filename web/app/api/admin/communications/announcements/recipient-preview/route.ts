import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { runAnnouncementRecipientPreview } from "@/lib/communications/v2/runAnnouncementRecipientPreview";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * Communications V2 — stateless announcement recipient preview.
 * READ-ONLY: resolves audience_spec from POST body without a saved announcement id.
 */

/** POST …/announcements/recipient-preview — count-only audience resolution from draft spec. */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: unknown = null;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const result = await runAnnouncementRecipientPreview(supabase, ctx.orgId, body);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result.preview);
}
