import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    acknowledgeStageMembershipSeen,
    loadAcknowledgedOccurrenceKeys,
    occurrenceKeyForAck,
} from "@/lib/queues/operatorStageMembershipAck";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * POST /api/admin/queues/stage-membership-ack
 * Intentional Focus Panel open → mark stage membership seen for the current operator.
 *
 * GET  /api/admin/queues/stage-membership-ack?keys=a,b,c
 * Hydrate which occurrence keys the current operator has already acknowledged.
 */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const subjectType = typeof body.subject_type === "string" ? body.subject_type.trim() : "";
    const subjectId = typeof body.subject_id === "string" ? body.subject_id.trim() : "";
    const stageKey = typeof body.stage_key === "string" ? body.stage_key.trim() : "";
    const stageEnteredAt =
        typeof body.stage_entered_at === "string" ? body.stage_entered_at.trim() : "";

    if (!subjectType || !UUID_RE.test(subjectId) || !stageKey || !stageEnteredAt) {
        return NextResponse.json(
            { error: "subject_type, subject_id, stage_key, and stage_entered_at are required" },
            { status: 400 },
        );
    }

    const supabase = createAdminClient();
    const result = await acknowledgeStageMembershipSeen(supabase, {
        orgId: ctx.orgId,
        userId: ctx.userId,
        subjectType,
        subjectId,
        stageKey,
        stageEnteredAtIso: stageEnteredAt,
    });

    if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, occurrence_key: result.occurrenceKey });
}

export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const raw = request.nextUrl.searchParams.get("keys") ?? "";
    const keys = raw
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
        .slice(0, 200);

    if (!keys.length) {
        return NextResponse.json({ occurrence_keys: [] as string[] });
    }

    const supabase = createAdminClient();
    const acknowledged = await loadAcknowledgedOccurrenceKeys({
        supabase,
        orgId: ctx.orgId,
        userId: ctx.userId,
        occurrenceKeys: keys,
    });

    return NextResponse.json({ occurrence_keys: [...acknowledged] });
}

/** Exported for tests — builds occurrence key with the same helper as POST. */
export function buildAckOccurrenceKeyForTest(input: {
    orgId: string;
    userId: string;
    subjectType: string;
    subjectId: string;
    stageKey: string;
    stageEnteredAtIso: string;
}): string {
    return occurrenceKeyForAck(input);
}
