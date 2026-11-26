import { NextRequest, NextResponse } from "next/server";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { canManageAnalytics } from "@/lib/admin/canReadAnalytics";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { answerOperationalQuestion } from "@/lib/operationalQuestions/answerOperationalQuestion";

export const dynamic = "force-dynamic";

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

/**
 * POST /api/admin/operational-questions/answer
 * Body: { question_key, roomId?, roomLabel?, effectiveAt?, persistHistory?, entryPoint? }
 */
export async function POST(req: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json(
            {
                answer: {
                    status: "unauthorized",
                    availability_reason: ctx.status === 401 ? "Unauthorized" : "Forbidden",
                },
                error: ctx.status === 401 ? "Unauthorized" : "Forbidden",
            },
            { status: ctx.status },
        );
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!isRecord(body)) return NextResponse.json({ error: "Expected object body" }, { status: 400 });

    const questionKey = typeof body.question_key === "string" ? body.question_key.trim() : "";
    if (!questionKey) return NextResponse.json({ error: "question_key is required" }, { status: 400 });

    const access = await getAdminAccessContextCached();
    const mayAuthor = access.ok && canManageAnalytics({ permissionKeys: access.permissionKeys });

    try {
        const supabase = createAdminClient();
        const answer = await answerOperationalQuestion(supabase, questionKey, {
            orgId: ctx.orgId,
            roomId: typeof body.roomId === "string" ? body.roomId : null,
            roomLabel: typeof body.roomLabel === "string" ? body.roomLabel : null,
            effectiveAt: typeof body.effectiveAt === "string" ? body.effectiveAt : null,
            /*
             * ASKING IS A READ. RECORDING IS AUTHORING.
             *
             * This handler answers an operational question and, by default, APPENDED the observation to
             * org_settings.metadata and saved it (`oiOrgCalcObserve`, persistHistory !== false). Its only
             * gate is an authenticated session with org membership, so any portal member could cause a
             * durable write - and could force it by passing the flag.
             *
             * The answer stays open on purpose: `canReadAnalytics` states the OI position as "ops keeps
             * reports.read, so Operational Intelligence stays readable and only authoring narrows", and
             * gating the question itself would take a read away from ops. So only the PERSISTENCE is
             * gated, on the same `reports.write` that already governs every sibling measurement write.
             * A caller without it still gets the answer; it simply is not recorded.
             */
            persistHistory: body.persistHistory !== false && mayAuthor,
            entryPoint:
                body.entryPoint === "bos" || body.entryPoint === "ui" || body.entryPoint === "api"
                    ? body.entryPoint
                    : "api",
        });
        return NextResponse.json({ answer });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to answer question" },
            { status: 500 },
        );
    }
}
