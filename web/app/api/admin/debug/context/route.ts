import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";

/**
 * Temporary debug endpoint: show current org context for this session.
 * Non-invasive: does not mutate anything, only echoes ctx + org name.
 */
export async function GET() {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const supabase = createAdminClient();
    const { data: orgRow } = await supabase.from("orgs").select("id, name, slug").eq("id", ctx.orgId).maybeSingle();

    return NextResponse.json({
        orgId: ctx.orgId,
        orgName: orgRow?.name ?? null,
        orgSlug: orgRow?.slug ?? null,
        role: ctx.role,
        userId: ctx.userId,
    });
}

