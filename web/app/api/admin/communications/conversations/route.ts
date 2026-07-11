import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import { enrichCommandCenterConversations } from "@/lib/communications/v2/commandCenterConversationEnrichment";
import { prepareCommandCenterQueue } from "@/lib/communications/v2/commandCenterViewModel";

/**
 * GET /api/admin/communications/conversations — org-scoped conversation summaries for the
 * Command Center queue (ACT-1). DARK behind comms_v2_command_center (404 when off). Read-only.
 * Returns the ConversationSummary shape the existing commandCenterViewModel already consumes.
 */
type ThreadRow = {
    id: string;
    channel: string | null;
    attention_state: string | null;
    assignment_state: string | null;
    assigned_user_id: string | null;
    location_id: string | null;
    sla_state: string | null;
    last_message_at: string | null;
    metadata: Record<string, unknown> | null;
    primary_entity_type: string | null;
    primary_entity_id: string | null;
    recipient_key: string | null;
};

export async function GET() {
    if (!isCommsV2FlagEnabled("comms_v2_command_center")) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;

    const supabase = createAdminClient();
    const { data: threads, error } = await supabase
        .from("communication_threads")
        .select(
            "id, channel, attention_state, assignment_state, assigned_user_id, location_id, sla_state, last_message_at, metadata, primary_entity_type, primary_entity_id, recipient_key"
        )
        .eq("org_id", ctx.orgId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (threads ?? []) as ThreadRow[];
    const ids = rows.map((r) => r.id);

    // unread = inbound messages on these threads without a read row for the viewer
    const unreadByThread: Record<string, number> = {};
    if (ids.length > 0) {
        const { data: inbound } = await supabase
            .from("communication_messages")
            .select("id, thread_id")
            .eq("org_id", ctx.orgId)
            .eq("direction", "inbound")
            .in("thread_id", ids)
            .limit(2000);
        const inb = (inbound ?? []) as { id: string; thread_id: string }[];
        const msgIds = inb.map((m) => m.id);
        let readSet = new Set<string>();
        if (msgIds.length > 0) {
            const { data: reads } = await supabase
                .from("communication_message_reads")
                .select("message_id")
                .eq("user_id", ctx.userId)
                .in("message_id", msgIds);
            readSet = new Set((reads ?? []).map((x) => String((x as { message_id: string }).message_id)));
        }
        for (const m of inb) {
            if (!readSet.has(m.id)) unreadByThread[m.thread_id] = (unreadByThread[m.thread_id] ?? 0) + 1;
        }
    }

    const conversations = prepareCommandCenterQueue(
        await enrichCommandCenterConversations(supabase, ctx.orgId, rows, unreadByThread)
    );

    return NextResponse.json({ conversations });
}
