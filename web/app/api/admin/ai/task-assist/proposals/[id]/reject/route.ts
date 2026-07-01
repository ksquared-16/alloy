import { NextRequest, NextResponse } from "next/server";

import { rejectTaskAssistProposal } from "@/lib/agent/taskAssist/taskAssistProposalPersistence";
import { isTaskAssistV1Uuid } from "@/lib/agent/taskAssist/taskAssistSuggestionValidators";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * POST `/api/admin/ai/task-assist/proposals/[id]/reject` — draft → rejected (no send).
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    void request;
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id } = await context.params;
    if (!id?.trim() || !isTaskAssistV1Uuid(id)) {
        return NextResponse.json({ ok: false, error: "INVALID_ID", message: "Proposal id must be a UUID." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const res = await rejectTaskAssistProposal({
        supabase,
        orgId: ctx.orgId,
        userId: ctx.userId,
        proposalId: id.trim(),
    });

    if (!res.ok) {
        const status = res.status ?? (res.error === "NOT_FOUND" ? 404 : 400);
        return NextResponse.json({ ok: false, error: res.error, message: res.message }, { status });
    }

    return NextResponse.json({ ok: true, proposal: res.row });
}
