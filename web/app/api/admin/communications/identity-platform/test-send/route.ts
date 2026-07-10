import { NextResponse } from "next/server";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { assertCommunicationsSendAllowed } from "@/lib/communications/communicationPermissions";
import { executeCommunicationsSend } from "@/lib/communications/executeCommunicationsSend";
import { requireIdentityPlatformAdmin } from "@/lib/communications/identity/admin/requireIdentityPlatformAdmin";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/** POST — controlled test send marked in metadata; uses canonical resolver. */
export async function POST(req: Request) {
    const forbidden = await requireIdentityPlatformAdmin();
    if (forbidden) return forbidden;
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;

    const sendAuth = await assertCommunicationsSendAllowed({
        orgId: ctx.orgId,
        actor: ctx.userId ? { userId: ctx.userId } : null,
    });
    if (!sendAuth.ok) {
        return NextResponse.json({ error: sendAuth.message, code: "communications_send_forbidden" }, { status: 403 });
    }

    let body: Record<string, unknown>;
    try {
        body = (await req.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const channel = String(body.channel ?? "").toLowerCase();
    const to = String(body.to ?? "").trim();
    const text = String(body.body ?? "").trim();
    const identityId = typeof body.identity_id === "string" ? body.identity_id.trim() : "";
    const locationId = typeof body.location_id === "string" ? body.location_id.trim() : null;

    if (channel !== "sms" && channel !== "email") {
        return NextResponse.json({ error: "channel must be sms or email" }, { status: 400 });
    }
    if (!to || !text) return NextResponse.json({ error: "to and body required" }, { status: 400 });

    const supabase = createAdminClient();
    const exec = await executeCommunicationsSend({
        supabase,
        orgId: ctx.orgId,
        quickMessage: true,
        primaryEntityType: "persons",
        primaryEntityId: ctx.userId ?? "00000000-0000-0000-0000-000000000001",
        channel,
        textRaw: text,
        subjectRawEmail: channel === "email" ? String(body.subject ?? "Alloy test send") : undefined,
        bindingIdOpt: "",
        identityIdOpt: UUID_RE.test(identityId) ? identityId : undefined,
        recipientPersonIdRaw: "",
        toRawInput: to,
        sendMetadataAugment: {
            source: "identity_platform_test_send",
            test_send: true,
            context_location_id: locationId && UUID_RE.test(locationId) ? locationId : null,
        },
    });

    if (!exec.ok) {
        return NextResponse.json({ error: exec.error, code: exec.code }, { status: exec.status });
    }
    return NextResponse.json({
        ok: true,
        communication_message_id: exec.communication_message_id,
        thread_id: exec.thread_id,
        test_send: true,
    });
}
