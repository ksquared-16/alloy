import { NextRequest, NextResponse } from "next/server";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import {
    TRIAGE_OPERATOR_ACTIONS,
    triageAttentionStateForAction,
    type TriageActionKey,
} from "@/lib/communications/v2/conversationTriage";

/**
 * POST /api/admin/communications/conversations/[id]/triage — operator attention_state update.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    if (!isCommsV2FlagEnabled("comms_v2_command_center")) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;

    const { id: threadId } = await context.params;
    let body: { action?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }

    const action = String(body.action ?? "") as TriageActionKey;
    if (!TRIAGE_OPERATOR_ACTIONS.some((a) => a.key === action)) {
        return NextResponse.json({ error: "invalid action" }, { status: 400 });
    }

    const attentionState = triageAttentionStateForAction(action);
    const supabase = createAdminClient();
    const { data: thread, error: tErr } = await supabase
        .from("communication_threads")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("id", threadId)
        .maybeSingle();
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
    if (!thread) return NextResponse.json({ error: "not found" }, { status: 404 });

    const { error: uErr } = await supabase
        .from("communication_threads")
        .update({ attention_state: attentionState })
        .eq("org_id", ctx.orgId)
        .eq("id", threadId);
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, attention_state: attentionState, action });
}
