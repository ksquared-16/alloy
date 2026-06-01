import { NextRequest, NextResponse } from "next/server";

import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import { listInboxThreads, parseInboxFolder, parseInboxLimit } from "@/lib/communications/inboxThreadsService";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * GET /api/admin/inbox/threads?folder=inbox|unread|sent|scheduled|archived&limit=
 * Org-wide inbox thread list (Messaging V2 Sprint A).
 */
export async function GET(request: NextRequest) {
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;

    const { searchParams } = new URL(request.url);
    const folder = parseInboxFolder(searchParams.get("folder")) ?? "inbox";
    const limit = parseInboxLimit(searchParams.get("limit"));

    const supabase = createAdminClient();
    const result = await listInboxThreads({
        supabase,
        orgId: ctx.orgId,
        userId: ctx.userId,
        folder,
        limit,
    });

    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json(result.data);
}
