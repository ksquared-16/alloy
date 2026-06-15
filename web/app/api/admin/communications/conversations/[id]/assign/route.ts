import { NextRequest, NextResponse } from "next/server";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import { applyAssignmentAction, type AssignmentFields } from "@/lib/communications/v2/assignmentSla";
import {
    CONVERSATION_ASSIGNMENT_ACTIONS,
    type ConversationAssignmentAction,
} from "@/lib/communications/v2/conversationCore";

/**
 * POST /api/admin/communications/conversations/[id]/assign — claim/assign/reassign/unassign/route.
 *
 * DARK: gated behind comms_v2_assignment (404 when off). Writes communication_threads assignment
 * fields + an immutable conversation_assignment_events audit row. No send, no message mutation. (PKG-10)
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    if (!isCommsV2FlagEnabled("comms_v2_assignment")) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id: threadId } = await context.params;
    let body: { action?: string; to_user_id?: string | null; to_team_id?: string | null };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }
    const action = String(body.action ?? "") as ConversationAssignmentAction;
    if (!CONVERSATION_ASSIGNMENT_ACTIONS.includes(action)) {
        return NextResponse.json({ error: "invalid action" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: thread, error: tErr } = await supabase
        .from("communication_threads")
        .select("id, assignment_state, assigned_user_id, assigned_team_id")
        .eq("org_id", ctx.orgId)
        .eq("id", threadId)
        .maybeSingle();
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });
    if (!thread) return NextResponse.json({ error: "not found" }, { status: 404 });

    const current: AssignmentFields = {
        assignment_state: thread.assignment_state === "assigned" ? "assigned" : "unassigned",
        assigned_user_id: thread.assigned_user_id ?? null,
        assigned_team_id: thread.assigned_team_id ?? null,
    };
    const { next, event } = applyAssignmentAction(current, action, {
        actorUserId: ctx.userId,
        toUserId: body.to_user_id ?? null,
        toTeamId: body.to_team_id ?? null,
    });

    const { error: uErr } = await supabase
        .from("communication_threads")
        .update({
            assignment_state: next.assignment_state,
            assigned_user_id: next.assigned_user_id,
            assigned_team_id: next.assigned_team_id,
        })
        .eq("org_id", ctx.orgId)
        .eq("id", threadId);
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

    const { error: eErr } = await supabase.from("conversation_assignment_events").insert({
        org_id: ctx.orgId,
        thread_id: threadId,
        action: event.action,
        from_user_id: event.from_user_id,
        to_user_id: event.to_user_id,
        to_team_id: event.to_team_id,
        actor_user_id: event.actor_user_id,
    });
    if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, assignment: next });
}
