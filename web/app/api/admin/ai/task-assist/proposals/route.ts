import { NextRequest, NextResponse } from "next/server";

import { parseOptionalExpiresAtIso, parseTaskAssistProposalPayloadForPersistence } from "@/lib/agent/taskAssist/taskAssistProposalPayload";
import { createTaskAssistProposal, listTaskAssistProposalsForEntity } from "@/lib/agent/taskAssist/taskAssistProposalPersistence";
import { isTaskAssistV1Uuid } from "@/lib/agent/taskAssist/taskAssistSuggestionValidators";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

function parseCreateBody(body: unknown): { ok: false; error: string; message: string } | { ok: true; expiresAt: string | null } {
    if (!isRecord(body)) {
        return { ok: false, error: "BAD_JSON_SHAPE", message: "Body must be a JSON object." };
    }
    const allowed = new Set(["payload", "expires_at"]);
    for (const k of Object.keys(body)) {
        if (!allowed.has(k)) {
            return { ok: false, error: "UNKNOWN_BODY_KEYS", message: `Unexpected key: ${k}` };
        }
    }
    const ex = parseOptionalExpiresAtIso(body.expires_at);
    if (!ex.ok) {
        return { ok: false, error: "EXPIRES_AT_INVALID", message: ex.message };
    }
    return { ok: true, expiresAt: ex.expiresAt };
}

/**
 * POST `/api/admin/ai/task-assist/proposals` — persist a validated Task Assist proposal (V1.1 Card 2).
 * GET `?entity_type=opportunities&entity_id=<uuid>` — list proposals for an opportunity (newest first).
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
        return NextResponse.json({ ok: false, error: "ENTITY_ID_INVALID", message: "entity_id query must be a UUID." }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "opportunities", entityId, ctx.orgId)).ok) {
        return NextResponse.json({ ok: false, error: "NOT_FOUND", message: "Opportunity not found." }, { status: 404 });
    }

    const listed = await listTaskAssistProposalsForEntity({
        supabase,
        orgId: ctx.orgId,
        entityType: "opportunities",
        entityId,
    });
    if (!listed.ok) {
        return NextResponse.json({ ok: false, error: listed.error, message: listed.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, proposals: listed.rows });
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

    const shell = parseCreateBody(body);
    if (!shell.ok) {
        return NextResponse.json({ ok: false, error: shell.error, message: shell.message }, { status: 400 });
    }

    const rawPayload = isRecord(body) ? body.payload : undefined;
    const parsed = parseTaskAssistProposalPayloadForPersistence(rawPayload);
    if (!parsed.ok) {
        const status =
            parsed.error === "WORKFLOW_KEYS_FORBIDDEN" || parsed.error === "UNKNOWN_PAYLOAD_KEYS" ? 400 : parsed.error === "PAYLOAD_VALIDATION_FAILED" ? 422 : 400;
        return NextResponse.json(
            {
                ok: false,
                error: parsed.error,
                message: parsed.message,
                validation_errors: parsed.validation_errors ?? null,
            },
            { status }
        );
    }

    if (parsed.suggestion.entity_id.trim() !== parsed.suggestion.entity_id) {
        return NextResponse.json({ ok: false, error: "ENTITY_ID_INVALID", message: "entity_id must be trimmed." }, { status: 400 });
    }

    const supabase = createAdminClient();
    if (!(await assertRowOrg(supabase, "opportunities", parsed.suggestion.entity_id.trim(), ctx.orgId)).ok) {
        return NextResponse.json({ ok: false, error: "NOT_FOUND", message: "Opportunity not found." }, { status: 404 });
    }

    const created = await createTaskAssistProposal({
        supabase,
        orgId: ctx.orgId,
        userId: ctx.userId,
        suggestion: parsed.suggestion,
        expiresAt: shell.expiresAt,
    });
    if (!created.ok) {
        return NextResponse.json({ ok: false, error: created.error, message: created.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, proposal: created.row }, { status: 201 });
}
