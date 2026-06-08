import { NextRequest, NextResponse } from "next/server";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    COMMUNICATIONS_SEND_PERMISSION_KEY,
    assertCommunicationsSendAllowed,
} from "@/lib/communications/communicationPermissions";
import { executeCommunicationsSend } from "@/lib/communications/executeCommunicationsSend";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** Match threads route normalization. */
function normalizeEntityTypeParam(raw: string): string | null {
    const s = raw.trim().toLowerCase();
    if (!s) return null;
    if (s === "opportunity") return "opportunities";
    if (s === "customer") return "customers";
    if (s === "job") return "jobs";
    if (s === "schedule") return "schedules";
    if (s === "contact") return "contacts";
    return s;
}

function normalizeChannel(raw: string): "sms" | "email" | "in_app" | null {
    const x = raw.trim().toLowerCase();
    if (x === "sms") return "sms";
    if (x === "email") return "email";
    if (x === "in_app" || x === "in-app") return "in_app";
    return null;
}

/**
 * POST /api/admin/communications/send — guarded composer enqueue (canonical path + message_queued).
 * requireAdminOrOps + {@link COMMUNICATIONS_SEND_PERMISSION_KEY} via role_permission_grants (admin/ops bypass;
 * legacy alias ops.messaging.write). Denied requests return 403 before enqueue.
 */
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
            { error: sendAuth.message, code: "communications_send_forbidden" },
            { status: 403 }
        );
    }

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const quickMessage = body.quick_message === true;
    let entityType = normalizeEntityTypeParam(String(body.entity_type ?? ""));
    let entityId = String(body.entity_id ?? "").trim();
    const channel = normalizeChannel(String(body.channel ?? ""));
    const toRawInput = String(body.to ?? body.to_address ?? "").trim();
    const textRaw = String(body.body ?? "").trim();
    const subjectRawEmail =
        channel === "email" && typeof body.subject === "string" ? body.subject : undefined;
    const bindingIdOpt = typeof body.binding_id === "string" ? body.binding_id.trim() : "";
    const recipientPersonIdRaw = typeof body.recipient_person_id === "string" ? body.recipient_person_id.trim() : "";

    if (!channel) return NextResponse.json({ error: "channel must be sms, email, or in_app" }, { status: 400 });
    if (!textRaw) return NextResponse.json({ error: "body is required" }, { status: 400 });
    if (channel === "in_app" && quickMessage) {
        return NextResponse.json({ error: "quick_message supports email and sms only" }, { status: 400 });
    }

    const supabase = createAdminClient();

    if (quickMessage) {
        if (!recipientPersonIdRaw || !UUID_RE.test(recipientPersonIdRaw)) {
            return NextResponse.json({ error: "quick_message requires recipient_person_id (UUID)" }, { status: 400 });
        }
        if (channel !== "email" && channel !== "sms") {
            return NextResponse.json({ error: "quick_message channel must be email or sms" }, { status: 400 });
        }
        /** Person-anchored threads; client entity_type/entity_id are ignored for quick send. */
        entityType = "persons";
        entityId = recipientPersonIdRaw;
    } else {
        if (
            !entityType ||
            (entityType !== "opportunities" && entityType !== "jobs" && entityType !== "persons")
        ) {
            return NextResponse.json(
                { error: "entity_type must be opportunities, jobs, or persons" },
                { status: 400 }
            );
        }
        if (!entityId || !UUID_RE.test(entityId)) return NextResponse.json({ error: "Valid entity_id required" }, { status: 400 });
    }

    if (entityType === "persons") {
        if (!(await assertRowOrg(supabase, "persons", entityId, ctx.orgId)).ok) {
            return NextResponse.json({ error: "Person not found" }, { status: 404 });
        }
    } else if (entityType === "opportunities" || entityType === "jobs") {
        const table = entityType === "jobs" ? "jobs" : "opportunities";
        if (!(await assertRowOrg(supabase, table, entityId, ctx.orgId)).ok) {
            return NextResponse.json({ error: "Entity not found" }, { status: 404 });
        }
    } else {
        return NextResponse.json({ error: "Invalid entity_type" }, { status: 500 });
    }

    const primaryEntityType = entityType;

    const exec = await executeCommunicationsSend({
        supabase,
        orgId: ctx.orgId,
        quickMessage,
        primaryEntityType,
        primaryEntityId: entityId,
        channel,
        textRaw,
        subjectRawEmail,
        bindingIdOpt,
        recipientPersonIdRaw,
        toRawInput,
        sendMetadataAugment: null,
    });

    if (!exec.ok) {
        return NextResponse.json(
            exec.code ? { error: exec.error, code: exec.code, thread_id: exec.thread_id } : { error: exec.error, thread_id: exec.thread_id },
            { status: exec.status }
        );
    }

    return NextResponse.json({
        ok: true,
        communication_message_id: exec.communication_message_id,
        thread_id: exec.thread_id,
        channel: exec.channel,
        permission_note: sendAuth.ok ? COMMUNICATIONS_SEND_PERMISSION_KEY : undefined,
        process_trigger_attempted_note: exec.process_trigger_attempted_note,
    });
}
