import { NextRequest, NextResponse } from "next/server";

import {
    isTaskAssistV1Uuid,
    validateTaskAssistV1ParsedJsonNoForbiddenWorkflowKeys,
} from "@/lib/agent/taskAssist/taskAssistSuggestionValidators";
import { cancelCommunicationScheduledSend } from "@/lib/communications/communicationScheduledSendsService";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

function parseCancelPatch(body: unknown): { ok: false; error: string; message: string } | { ok: true } {
    if (!isRecord(body)) {
        return { ok: false, error: "BAD_JSON_SHAPE", message: "Body must be a JSON object." };
    }
    const wf = validateTaskAssistV1ParsedJsonNoForbiddenWorkflowKeys(body);
    if (wf.length) {
        return { ok: false, error: "WORKFLOW_KEYS_FORBIDDEN", message: wf[0] ?? "Forbidden key." };
    }
    const allowed = new Set(["status"]);
    for (const k of Object.keys(body)) {
        if (!allowed.has(k)) {
            return { ok: false, error: "UNKNOWN_BODY_KEYS", message: `Unexpected key: ${k}` };
        }
    }
    if (body.status !== "canceled") {
        return { ok: false, error: "STATUS_INVALID", message: "Only status: canceled is supported." };
    }
    return { ok: true };
}

/**
 * PATCH `/api/admin/communication-scheduled-sends/[id]` — `{ "status": "canceled" }` (**pending** only).
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id } = await context.params;
    if (!id?.trim() || !isTaskAssistV1Uuid(id)) {
        return NextResponse.json({ ok: false, error: "INVALID_ID", message: "id must be a UUID." }, { status: 400 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });
    }

    const parsed = parseCancelPatch(body);
    if (!parsed.ok) {
        return NextResponse.json({ ok: false, error: parsed.error, message: parsed.message }, { status: 400 });
    }

    const supabase = createAdminClient();
    const res = await cancelCommunicationScheduledSend({
        supabase,
        orgId: ctx.orgId,
        id: id.trim(),
    });

    if (!res.ok) {
        const status = res.status ?? (res.error === "NOT_FOUND" ? 404 : 400);
        return NextResponse.json({ ok: false, error: res.error, message: res.message }, { status });
    }

    return NextResponse.json({ ok: true, scheduled_send: res.row });
}
