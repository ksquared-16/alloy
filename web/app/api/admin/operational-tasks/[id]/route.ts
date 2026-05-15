import { NextRequest, NextResponse } from "next/server";

import {
    isTaskAssistV1Uuid,
    validateTaskAssistV1ParsedJsonNoForbiddenWorkflowKeys,
} from "@/lib/agent/taskAssist/taskAssistSuggestionValidators";
import { cancelOperationalTask, completeOperationalTask } from "@/lib/admin/operationalTasksService";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

function parseStatusPatch(body: unknown): { ok: false; error: string; message: string } | { ok: true; status: "completed" | "canceled" } {
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
    const s = body.status === "completed" || body.status === "canceled" ? body.status : null;
    if (!s) {
        return { ok: false, error: "STATUS_INVALID", message: "status must be completed or canceled." };
    }
    return { ok: true, status: s };
}

/**
 * PATCH `/api/admin/operational-tasks/[id]` — `{ "status": "completed" | "canceled" }` (open → terminal only).
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id } = await context.params;
    if (!id?.trim() || !isTaskAssistV1Uuid(id)) {
        return NextResponse.json({ ok: false, error: "INVALID_ID", message: "Task id must be a UUID." }, { status: 400 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });
    }

    const parsed = parseStatusPatch(body);
    if (!parsed.ok) {
        return NextResponse.json({ ok: false, error: parsed.error, message: parsed.message }, { status: 400 });
    }

    const supabase = createAdminClient();
    const res =
        parsed.status === "completed"
            ? await completeOperationalTask({ supabase, orgId: ctx.orgId, taskId: id.trim() })
            : await cancelOperationalTask({ supabase, orgId: ctx.orgId, taskId: id.trim() });

    if (!res.ok) {
        const status = res.status ?? (res.error === "NOT_FOUND" ? 404 : 400);
        return NextResponse.json({ ok: false, error: res.error, message: res.message }, { status });
    }

    return NextResponse.json({ ok: true, task: res.row });
}
