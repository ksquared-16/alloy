import { NextRequest, NextResponse } from "next/server";
import { assertRowOrg } from "@/lib/admin/assertRowOrg";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import {
    activeOutboundBindings,
    availableComposerChannels,
    type BindingSummary,
} from "@/lib/communications/composerChannels";
import {
    COMMUNICATIONS_SEND_PERMISSION_KEY,
    assertCommunicationsSendAllowed,
} from "@/lib/communications/communicationPermissions";
import { enqueueCanonicalOutboundMessage } from "@/lib/communications/canonicalOutboundEnqueue";
import {
    assertRecipientPersonEligibleForDrawerEmail,
    getPersonEmailOrNull,
} from "@/lib/communications/drawerEmailRecipients";
import { normalizeRecipientKeyEmail, normalizeRecipientKeySms } from "@/lib/communications/recipientKey";
import { triggerBackendMessagesQueue } from "@/lib/communications/triggerBackendMessagesQueue";

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

async function resolveContextLocationId(
    supabase: ReturnType<typeof createAdminClient>,
    orgId: string,
    entityType: string,
    entityId: string
): Promise<string | null> {
    if (entityType === "jobs") {
        const { data } = await supabase
            .from("jobs")
            .select("location_id")
            .eq("id", entityId)
            .eq("org_id", orgId)
            .maybeSingle();
        const lid = data && typeof data === "object" ? (data as { location_id?: string }).location_id : null;
        return lid ? String(lid) : null;
    }
    return null;
}

/**
 * POST /api/admin/communications/send — guarded composer enqueue (canonical path + message_queued).
 * Admin/ops + communications.send stub; future org matrix may tighten.
 */
export async function POST(request: NextRequest) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;

    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const finer = await assertCommunicationsSendAllowed({
        orgId: ctx.orgId,
        actor: ctx.userId ? { userId: ctx.userId } : null,
    });
    if (!finer.ok) return NextResponse.json({ error: finer.message }, { status: 403 });

    let body: Record<string, unknown>;
    try {
        body = (await request.json()) as Record<string, unknown>;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const entityType = normalizeEntityTypeParam(String(body.entity_type ?? ""));
    const entityId = String(body.entity_id ?? "").trim();
    const channel = normalizeChannel(String(body.channel ?? ""));
    const toRawInput = String(body.to ?? body.to_address ?? "").trim();
    let toRaw = toRawInput;
    const textRaw = String(body.body ?? "").trim();
    const subjectRawEmail =
        channel === "email" && typeof body.subject === "string" ? body.subject : undefined;
    const bindingIdOpt = typeof body.binding_id === "string" ? body.binding_id.trim() : "";
    const recipientPersonIdRaw = typeof body.recipient_person_id === "string" ? body.recipient_person_id.trim() : "";

    if (!entityType || (entityType !== "opportunities" && entityType !== "jobs")) {
        return NextResponse.json({ error: "entity_type must be opportunities or jobs" }, { status: 400 });
    }
    if (!entityId || !UUID_RE.test(entityId)) return NextResponse.json({ error: "Valid entity_id required" }, { status: 400 });
    if (!channel) return NextResponse.json({ error: "channel must be sms, email, or in_app" }, { status: 400 });
    if (!textRaw) return NextResponse.json({ error: "body is required" }, { status: 400 });

    const supabase = createAdminClient();
    const table = entityType === "jobs" ? "jobs" : "opportunities";
    if (!(await assertRowOrg(supabase, table, entityId, ctx.orgId)).ok) {
        return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    if (channel === "email" && recipientPersonIdRaw && UUID_RE.test(recipientPersonIdRaw)) {
        const elig = await assertRecipientPersonEligibleForDrawerEmail(
            supabase,
            ctx.orgId,
            entityType,
            entityId,
            recipientPersonIdRaw
        );
        if (!elig) {
            return NextResponse.json(
                { error: "recipient_person_id is not an eligible person-with-email for this record" },
                { status: 400 }
            );
        }
        const em = await getPersonEmailOrNull(supabase, ctx.orgId, recipientPersonIdRaw);
        if (!em) {
            return NextResponse.json({ error: "Recipient person has no usable email" }, { status: 400 });
        }
        toRaw = em;
    }

    const { data: rows, error: bindErr } = await supabase
        .from("communication_provider_bindings")
        .select("id, channel, scope, location_id, display_label, provider, status, is_primary, secret_ref, inbound_to_e164, config")
        .eq("org_id", ctx.orgId)
        .order("updated_at", { ascending: false });

    if (bindErr) return NextResponse.json({ error: bindErr.message }, { status: 500 });
    const bindList = (rows ?? []) as BindingSummary[];

    const allowed = availableComposerChannels(bindList);
    if (!allowed.includes(channel)) {
        return NextResponse.json(
            { error: `${channel} is not configured for outbound in this org (check bindings)`, code: "channel_unavailable" },
            { status: 422 }
        );
    }

    const locId = await resolveContextLocationId(supabase, ctx.orgId, entityType, entityId);

    let resolvedBindingId: string | null = null;
    if (channel !== "in_app") {
        if (!toRaw) return NextResponse.json({ error: "to address required for sms/email" }, { status: 400 });
        const norm = channel === "sms" ? normalizeRecipientKeySms(toRaw) : normalizeRecipientKeyEmail(toRaw);
        if (channel === "sms" && !norm.replace(/\D/g, "").length) {
            return NextResponse.json({ error: "Invalid SMS destination" }, { status: 400 });
        }
        if (channel === "email" && !norm.includes("@")) {
            return NextResponse.json({ error: "Invalid email destination" }, { status: 400 });
        }

        const pool = activeOutboundBindings(bindList, channel);
        let candidates = pool;
        if (bindingIdOpt && UUID_RE.test(bindingIdOpt)) {
            candidates = pool.filter((b) => b.id === bindingIdOpt);
            if (!candidates.length) {
                return NextResponse.json({ error: "binding_id not valid for channel/org" }, { status: 400 });
            }
        }
        if (!candidates.length) {
            return NextResponse.json(
                { error: "No actionable binding rows for chosen channel", code: "binding_missing" },
                { status: 422 }
            );
        }
        resolvedBindingId =
            bindingIdOpt && UUID_RE.test(bindingIdOpt) ? bindingIdOpt : (candidates[0]?.id ?? null);
    } else if (bindingIdOpt) {
        return NextResponse.json({ error: "binding_id applies only to sms/email" }, { status: 400 });
    }

    const meta: Record<string, unknown> = {
        source: "drawer_composer",
        ...(bindingIdOpt && UUID_RE.test(bindingIdOpt) ? { requested_binding_id: bindingIdOpt } : {}),
        ...(recipientPersonIdRaw && UUID_RE.test(recipientPersonIdRaw) ? { recipient_person_id: recipientPersonIdRaw } : {}),
    };

    const res = await enqueueCanonicalOutboundMessage({
        supabase,
        orgId: ctx.orgId,
        primaryEntityType: entityType,
        primaryEntityId: entityId,
        channelRaw: channel,
        toRaw,
        bodyRaw: textRaw,
        ...(channel === "email" ? { emailSubjectRaw: subjectRawEmail ?? "" } : {}),
        workflowRunId: null,
        metadata: meta,
        contextLocationId: locId,
        communicationProviderBindingId: resolvedBindingId,
    });

    if (res.skippedReason === "insert_failed" || !res.communicationMessageId) {
        return NextResponse.json(
            {
                error: `Failed to enqueue message (${res.skippedReason ?? "unknown"})`,
                thread_id: res.threadId,
            },
            { status: 500 }
        );
    }

    void triggerBackendMessagesQueue({ workflow_run_id: null, limit: 25 }).catch(() => {});

    const envUnset =
        !(process.env.INTERNAL_MESSAGES_PROCESS_URL ?? "").trim() ||
        !(process.env.INTERNAL_CRON_TOKEN ?? "").trim();

    return NextResponse.json({
        ok: true,
        communication_message_id: res.communicationMessageId,
        thread_id: res.threadId,
        channel,
        permission_note: finer.ok ? COMMUNICATIONS_SEND_PERMISSION_KEY : undefined,
        process_trigger_attempted_note: envUnset
            ? "INTERNAL_MESSAGES_PROCESS_URL/INTERNAL_CRON_TOKEN unset — row stays queued until cron runs."
            : "Backend process trigger dispatched (best-effort).",
    });
}
