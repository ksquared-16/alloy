import { NextRequest, NextResponse } from "next/server";

import {
    isTaskAssistV1Uuid,
    validateTaskAssistV1ParsedJsonNoForbiddenWorkflowKeys,
} from "@/lib/agent/taskAssist/taskAssistSuggestionValidators";
import {
    cancelWorkInstance,
    completeWorkInstance,
    toOperationalTaskApiRow,
    updateWorkInstanceFields,
} from "@/lib/admin/operationalWork";
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

function parseFieldsPatch(
    body: unknown
):
    | { ok: false; error: string; message: string }
    | { ok: true; value: { title?: string; description?: string | null; due_at?: string; assigned_to_user_id?: string | null } } {
    if (!isRecord(body)) {
        return { ok: false, error: "BAD_JSON_SHAPE", message: "Body must be a JSON object." };
    }
    const wf = validateTaskAssistV1ParsedJsonNoForbiddenWorkflowKeys(body);
    if (wf.length) {
        return { ok: false, error: "WORKFLOW_KEYS_FORBIDDEN", message: wf[0] ?? "Forbidden key." };
    }
    const allowed = new Set(["title", "description", "due_at", "assigned_to_user_id"]);
    for (const k of Object.keys(body)) {
        if (!allowed.has(k)) {
            return { ok: false, error: "UNKNOWN_BODY_KEYS", message: `Unexpected key: ${k}` };
        }
    }
    const value: { title?: string; description?: string | null; due_at?: string; assigned_to_user_id?: string | null } = {};
    if (body.title != null) {
        if (typeof body.title !== "string") {
            return { ok: false, error: "TITLE_INVALID", message: "title must be a string." };
        }
        value.title = body.title;
    }
    if (body.description !== undefined) {
        value.description = body.description == null ? null : String(body.description);
    }
    if (body.due_at != null) {
        if (typeof body.due_at !== "string") {
            return { ok: false, error: "DUE_INVALID", message: "due_at must be an ISO string." };
        }
        value.due_at = body.due_at;
    }
    if (body.assigned_to_user_id !== undefined) {
        if (body.assigned_to_user_id === null || body.assigned_to_user_id === "") {
            value.assigned_to_user_id = null;
        } else if (typeof body.assigned_to_user_id !== "string") {
            return { ok: false, error: "ASSIGNED_INVALID", message: "assigned_to_user_id must be a UUID string or null." };
        } else {
            value.assigned_to_user_id = body.assigned_to_user_id.trim();
        }
    }
    if (!Object.keys(value).length) {
        return { ok: false, error: "EMPTY_PATCH", message: "Provide title, description, due_at, and/or assigned_to_user_id." };
    }
    return { ok: true, value };
}

/**
 * PATCH `/api/admin/operational-tasks/[id]`
 * - `{ status: "completed" | "canceled" }` — terminal status
 * - `{ title?, description?, due_at? }` — edit open task fields
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

    const supabase = createAdminClient();

    if (isRecord(body) && "status" in body) {
        const parsed = parseStatusPatch(body);
        if (!parsed.ok) {
            return NextResponse.json({ ok: false, error: parsed.error, message: parsed.message }, { status: 400 });
        }
        const res =
            parsed.status === "completed"
                ? await completeWorkInstance({ supabase, orgId: ctx.orgId, workId: id.trim() })
                : await cancelWorkInstance({ supabase, orgId: ctx.orgId, workId: id.trim() });
        if (!res.ok) {
            const status = res.status ?? (res.error === "NOT_FOUND" ? 404 : 400);
            return NextResponse.json({ ok: false, error: res.error, message: res.message }, { status });
        }
        return NextResponse.json({ ok: true, task: toOperationalTaskApiRow(res.row) });
    }

    const fields = parseFieldsPatch(body);
    if (!fields.ok) {
        return NextResponse.json({ ok: false, error: fields.error, message: fields.message }, { status: 400 });
    }
    const res = await updateWorkInstanceFields({
        supabase,
        orgId: ctx.orgId,
        workId: id.trim(),
        title: fields.value.title,
        description: fields.value.description,
        dueAtIso: fields.value.due_at,
        assignedToUserId: fields.value.assigned_to_user_id,
    });
    if (!res.ok) {
        const status = res.status ?? (res.error === "NOT_FOUND" ? 404 : 400);
        return NextResponse.json({ ok: false, error: res.error, message: res.message }, { status });
    }
    return NextResponse.json({ ok: true, task: toOperationalTaskApiRow(res.row) });
}
