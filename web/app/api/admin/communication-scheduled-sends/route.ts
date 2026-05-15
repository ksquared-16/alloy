import { NextRequest, NextResponse } from "next/server";

import { isTaskAssistV1Uuid } from "@/lib/agent/taskAssist/taskAssistSuggestionValidators";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import {
    createCommunicationScheduledSend,
    listCommunicationScheduledSendsForEntity,
    validateCommunicationScheduledSendCreateBody,
} from "@/lib/communications/communicationScheduledSendsService";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import {
    assertCommunicationsSendAllowed,
} from "@/lib/communications/communicationPermissions";
import { createAdminClient } from "@/lib/supabaseAdmin";

/**
 * GET `/api/admin/communication-scheduled-sends?entity_type=opportunities&entity_id=<uuid>`
 * POST `/api/admin/communication-scheduled-sends` — create pending row (no send).
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

    const listed = await listCommunicationScheduledSendsForEntity({
        supabase,
        orgId: ctx.orgId,
        entityType: "opportunities",
        entityId,
    });
    if (!listed.ok) {
        return NextResponse.json({ ok: false, error: listed.error, message: listed.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, scheduled_sends: listed.rows });
}

export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const sendAuth = await assertCommunicationsSendAllowed({
        orgId: ctx.orgId,
        actor: ctx.userId ? { userId: ctx.userId } : null,
    });
    if (!sendAuth.ok) {
        return NextResponse.json(
            { ok: false, error: "communications_send_forbidden", message: sendAuth.message },
            { status: 403 }
        );
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ ok: false, error: "BAD_JSON" }, { status: 400 });
    }

    const nowMs = Date.now();
    const parsed = validateCommunicationScheduledSendCreateBody(body, { nowMs });
    if (!parsed.ok) {
        return NextResponse.json({ ok: false, error: parsed.error, message: parsed.message }, { status: 400 });
    }

    const supabase = createAdminClient();
    const v = parsed.value;

    if (!(await assertRowOrg(supabase, "opportunities", v.entity_id, ctx.orgId)).ok) {
        return NextResponse.json({ ok: false, error: "NOT_FOUND", message: "Opportunity not found." }, { status: 404 });
    }
    if (!(await assertRowOrg(supabase, "persons", v.recipient_person_id, ctx.orgId)).ok) {
        return NextResponse.json({ ok: false, error: "NOT_FOUND", message: "Recipient person not found." }, { status: 404 });
    }

    const approvedAtIso = new Date(nowMs).toISOString();
    const created = await createCommunicationScheduledSend({
        supabase,
        orgId: ctx.orgId,
        userId: ctx.userId,
        input: v,
        approvedAtIso,
    });

    if (!created.ok) {
        const status = created.status ?? (created.error === "NOT_FOUND" ? 404 : 400);
        return NextResponse.json({ ok: false, error: created.error, message: created.message }, { status });
    }

    return NextResponse.json({ ok: true, scheduled_send: created.row }, { status: 201 });
}
