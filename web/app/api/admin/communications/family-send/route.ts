import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminOrgContextLight } from "@/lib/admin/getAdminOrgContextLight";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { assertCommunicationsSendAllowed } from "@/lib/communications/communicationPermissions";
import { isCommsV2FlagEnabled } from "@/lib/communications/v2/flags";
import { executeCommunicationsSend } from "@/lib/communications/executeCommunicationsSend";
import { enforceConsentForSend } from "@/lib/communications/v2/consentEnforcement";
import { resolveFamilyCommunicationWorkspace } from "@/lib/communications/v2/familyWorkspace";
import { orchestrateFamilySend, type FamilySendChannel, type RecipientVM } from "@/lib/communications/v2/familyWorkspace";

/**
 * POST /api/admin/communications/family-send — UI-5G.
 * Review-first family send: confirm!==true => preflight (no sends); confirm===true => fan out one
 * send per recipient, reusing executeCommunicationsSend (no new transport). Consent enforced per
 * recipient/channel/category via enforceConsentForSend when comms_v2_compliance is on.
 * DARK behind comms_v2_command_center.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
    if (!isCommsV2FlagEnabled("comms_v2_command_center")) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const ctx = await requireAdminOrgContextLight();
    if (ctx instanceof Response) return ctx;

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
        body = (await req.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const customerId = String(body.customer_id ?? "").trim();
    if (!UUID_RE.test(customerId)) return NextResponse.json({ error: "customer_id must be a UUID" }, { status: 400 });

    const rawIds = Array.isArray(body.recipient_person_ids) ? (body.recipient_person_ids as unknown[]) : [];
    const recipientPersonIds = rawIds.map((x) => String(x).trim()).filter((x) => UUID_RE.test(x));
    if (recipientPersonIds.length === 0) return NextResponse.json({ error: "recipient_person_ids must be a non-empty list of UUIDs" }, { status: 400 });

    const channelRaw = String(body.channel ?? "").toLowerCase();
    if (channelRaw !== "email" && channelRaw !== "sms") {
        return NextResponse.json({ error: "channel must be email or sms (note send is not supported by family-send in 5G)" }, { status: 400 });
    }
    const channel = channelRaw as FamilySendChannel;
    const subject = typeof body.subject === "string" ? body.subject : null;
    const message = String(body.body ?? "").trim();
    if (!message) return NextResponse.json({ error: "body is required" }, { status: 400 });
    if (channel === "email" && !(subject && subject.trim())) return NextResponse.json({ error: "subject is required for email" }, { status: 400 });
    const confirm = body.confirm === true;
    const clientToken = typeof body.client_token === "string" ? body.client_token : null;
    const replyToThreadId = typeof body.reply_to_thread_id === "string" ? body.reply_to_thread_id : null;

    const supabase = createAdminClient();
    const orgCheck = await assertRowOrg(supabase, "customers", customerId, ctx.orgId);
    if (!orgCheck.ok) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

    const enforceConsent = isCommsV2FlagEnabled("comms_v2_compliance");

    try {
        const vm = await resolveFamilyCommunicationWorkspace(supabase, ctx.orgId, { customerId, composerChannel: channel });
        const recipientById = new Map<string, RecipientVM>();
        for (const g of vm.recipientGroups) for (const r of g.recipients) recipientById.set(r.id, r);

        const result = await orchestrateFamilySend(
            {
                getRecipient: (id) => recipientById.get(id),
                checkConsent: async (personId) => {
                    if (!enforceConsent) return null;
                    const decision = await enforceConsentForSend({ supabase, orgId: ctx.orgId, personId, channel, lifecycleStage: vm.family.lifecycleStage });
                    return { allowed: decision.allowed, reason: decision.reason ?? null };
                },
                runSend: async ({ personId, channel: ch, subject: subj, body: text }) => {
                    const exec = await executeCommunicationsSend({
                        supabase,
                        orgId: ctx.orgId,
                        quickMessage: true,
                        primaryEntityType: "persons",
                        primaryEntityId: personId,
                        channel: ch,
                        textRaw: text,
                        subjectRawEmail: ch === "email" ? (subj ?? undefined) : undefined,
                        bindingIdOpt: "",
                        recipientPersonIdRaw: personId,
                        toRawInput: "",
                        sendMetadataAugment: { source: "family_send", client_token: clientToken, reply_to_thread_id: replyToThreadId },
                    });
                    return exec.ok
                        ? { ok: true, thread_id: exec.thread_id, communication_message_id: exec.communication_message_id }
                        : { ok: false, error: exec.error, code: exec.code, thread_id: exec.thread_id };
                },
            },
            { recipientPersonIds, channel, subject, body: message, confirm }
        );

        return NextResponse.json({
            ...result,
            meta: { customer_id: customerId, channel, confirm, consent_enforced: enforceConsent },
        });
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Family send failed" }, { status: 500 });
    }
}
