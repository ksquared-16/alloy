import { NextRequest, NextResponse } from "next/server";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { parseFutureRoomCapacityBosIntent } from "@/lib/operationalQuestions/bos/parseFutureRoomCapacityIntent";
import { runFutureRoomCapacityBosTurn } from "@/lib/operationalQuestions/bos/runFutureRoomCapacityBosTurn";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

/**
 * POST /api/admin/operational-questions/bos
 * Body: { message: string } — BOS Question interface entry using shared dispatch.
 */
export async function POST(req: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!isRecord(body)) return NextResponse.json({ error: "Expected object body" }, { status: 400 });
    const message = typeof body.message === "string" ? body.message : "";
    if (!message.trim()) return NextResponse.json({ error: "message is required" }, { status: 400 });

    const intent = parseFutureRoomCapacityBosIntent(message);
    if (intent.kind === "none") {
        return NextResponse.json({
            matched: false,
            intent,
            transcript_lines: [],
            clarify: null,
            answer: null,
        });
    }

    try {
        const supabase = createAdminClient();
        const turn = await runFutureRoomCapacityBosTurn(supabase, {
            orgId: ctx.orgId,
            userId: ctx.userId,
            intent,
        });
        return NextResponse.json({ matched: true, ...turn });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "BOS question turn failed" },
            { status: 500 },
        );
    }
}
