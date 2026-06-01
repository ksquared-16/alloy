import { NextRequest, NextResponse } from "next/server";

import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import { setInboxThreadArchived } from "@/lib/communications/inboxThreadsService";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrOps } from "@/lib/adminAuth";

type RouteContext = { params: Promise<{ threadId: string }> };

/**
 * PATCH /api/admin/inbox/threads/[threadId] — archive or unarchive thread.
 * Body: { "archived": true | false }
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;

    const { threadId } = await context.params;

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (typeof body.archived !== "boolean") {
        return NextResponse.json({ error: "archived boolean required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const result = await setInboxThreadArchived({
        supabase,
        orgId: ctx.orgId,
        threadId,
        archived: body.archived,
    });

    if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true, archived: body.archived });
}
