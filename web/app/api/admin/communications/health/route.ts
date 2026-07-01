import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import {
    computeCommunicationHealth,
    type HealthMessage,
} from "@/lib/communications/v2/communicationHealth";

/**
 * GET /api/admin/communications/health?thread_id=… — Communication Health for one conversation.
 *
 * DARK: gated behind comms_v2_command_center; returns 404 when the flag is off so this endpoint is
 * invisible until V2 ships. Read-only; no send, no mutation. (PKG-09)
 */
export async function GET(req: Request) {
    if (!isCommsV2FlagEnabled("comms_v2_command_center")) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;

    const threadId = new URL(req.url).searchParams.get("thread_id");
    if (!threadId) {
        return NextResponse.json({ error: "thread_id is required" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from("communication_messages")
        .select("direction, created_at, channel, opened_at, replied_at")
        .eq("org_id", ctx.orgId)
        .eq("thread_id", threadId)
        .order("created_at", { ascending: false })
        .limit(200);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const health = computeCommunicationHealth({ messages: (data ?? []) as HealthMessage[] });
    return NextResponse.json({ health });
}
