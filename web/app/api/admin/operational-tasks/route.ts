import { NextRequest, NextResponse } from "next/server";

import { isTaskAssistV1Uuid } from "@/lib/agent/taskAssist/taskAssistSuggestionValidators";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import {
    createOperationalTask,
    listOperationalTasksForEntity,
    validateOperationalTaskCreateBody,
} from "@/lib/admin/operationalTasksService";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * GET `/api/admin/operational-tasks?entity_type=opportunities&entity_id=<uuid>`
 * POST `/api/admin/operational-tasks` — create Task Assist–sourced operational task (no send).
 */
export async function GET(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const url = new URL(request.url);
    const entityType = (url.searchParams.get("entity_type") ?? "").trim().toLowerCase();
    const entityId = (url.searchParams.get("entity_id") ?? "").trim();
    if (entityType !== "opportunities") {
        return NextResponse.json({ ok: false, error: "ENTITY_TYPE_UNSUPPORTED", message: "entity_type must be opportunities." }, { status: 400 });
    }
    if (!entityId || !isTaskAssistV1Uuid(entityId)) {
        return NextResponse.json({ ok: false, error: "ENTITY_ID_INVALID", message: "entity_id must be a UUID." }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "opportunities", entityId, ctx.orgId)).ok) {
        return NextResponse.json({ ok: false, error: "NOT_FOUND", message: "Opportunity not found." }, { status: 404 });
    }

    const listed = await listOperationalTasksForEntity({
        supabase,
        orgId: ctx.orgId,
        entityType: "opportunities",
        entityId,
    });
    if (!listed.ok) {
        return NextResponse.json({ ok: false, error: listed.error, message: listed.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, tasks: listed.rows });
}

export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });
    }

    const parsed = validateOperationalTaskCreateBody(body);
    if (!parsed.ok) {
        return NextResponse.json({ ok: false, error: parsed.error, message: parsed.message }, { status: 400 });
    }
    const v = parsed.value;

    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "opportunities", v.entity_id, ctx.orgId)).ok) {
        return NextResponse.json({ ok: false, error: "NOT_FOUND", message: "Opportunity not found." }, { status: 404 });
    }

    const created = await createOperationalTask({
        supabase,
        orgId: ctx.orgId,
        userId: ctx.userId,
        entityId: v.entity_id,
        title: v.title,
        description: v.description,
        dueAtIso: v.due_at,
        source: v.source,
        proposalId: v.proposal_id,
        assignedToUserId: v.assigned_to_user_id,
        metadata: v.metadata,
    });

    if (!created.ok) {
        const status = created.status ?? (created.error === "NOT_FOUND" ? 404 : 400);
        return NextResponse.json({ ok: false, error: created.error, message: created.message }, { status });
    }

    return NextResponse.json({ ok: true, task: created.row }, { status: 201 });
}
