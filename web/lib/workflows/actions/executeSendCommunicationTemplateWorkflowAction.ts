import type { SupabaseClient } from "@supabase/supabase-js";

import { buildRecordRenderContext } from "@/lib/communications/render/buildRecordRenderContext";
import { canonicalSend } from "@/lib/communications/send/canonicalSend";
import { triggerBackendMessagesQueue } from "@/lib/communications/triggerBackendMessagesQueue";
import { reconcileContactAttemptOnProviderAcceptance } from "@/lib/communications/contactAttemptOnProviderAcceptance";

/**
 * Workflow action `send_communication_template` — an automation sends a TEMPLATE LIBRARY message.
 *
 *   payload: { communication_template_id | system_key, channel?: "sms" | "email" }
 *
 * The template is referenced, never copied: its CURRENT version is resolved at execution, so editing the
 * template in the Library changes what the automation sends. Content renders against the lead's records
 * (`buildRecordRenderContext` — the same context an operator's send uses) and goes out through the one
 * canonical sender (`canonicalSend`: purpose, eligibility, consent, render, enqueue). The recipient is the
 * lead's primary person.
 *
 * Exactly once per (workflow, lead, template, channel): the idempotency key says so, so a replayed event
 * cannot send twice. A successful send is a contact attempt on the lead's open work — the same
 * association an operator's send makes.
 */
export const SEND_COMMUNICATION_TEMPLATE_ACTION = "send_communication_template" as const;
export const AUTOMATION_PURPOSE = "automated_family_message" as const;

export type SendCommunicationTemplateActionResult =
    | { status: "completed"; log: string; outputs: Record<string, unknown> }
    | { status: "skipped"; log: string; skipReason: string; outputs: Record<string, unknown> };

function str(v: unknown): string {
    return typeof v === "string" ? v.trim() : "";
}

export async function executeSendCommunicationTemplateWorkflowAction(input: {
    supabase: SupabaseClient;
    orgId: string;
    workflowId: string;
    actionPayload: Record<string, unknown>;
    workflowPayload: Record<string, unknown>;
}): Promise<SendCommunicationTemplateActionResult> {
    const { supabase, orgId, actionPayload: pl, workflowPayload: ev } = input;
    const skip = (skipReason: string, outputs: Record<string, unknown> = {}): SendCommunicationTemplateActionResult => ({
        status: "skipped",
        log: `send_communication_template skipped: ${skipReason}`,
        skipReason,
        outputs,
    });

    const leadId = str(ev.lead_id) || str(ev.opportunity_id) || (str(ev.entity_type) === "opportunities" ? str(ev.entity_id) : "");
    if (!orgId || !leadId) return skip("no_lead");

    // ---- the template, by reference -------------------------------------------------------------
    const templateId = str(pl.communication_template_id);
    const systemKey = str(pl.system_key);
    if (!templateId && !systemKey) return skip("no_template_reference");
    let tq = supabase.from("communication_templates").select("id, channel, status, current_version_id").eq("org_id", orgId);
    tq = templateId ? tq.eq("id", templateId) : tq.eq("system_key", systemKey);
    const { data: template } = await tq.maybeSingle();
    const tpl = template as { id: string; channel: string | null; status: string | null; current_version_id: string | null } | null;
    if (!tpl) return skip("template_not_found");
    if (String(tpl.status ?? "").toLowerCase() !== "active") return skip("template_not_active", { template_id: tpl.id });
    if (!tpl.current_version_id) return skip("template_has_no_current_version", { template_id: tpl.id });
    const { data: version } = await supabase
        .from("communication_template_versions")
        .select("id, version_number, subject, body")
        .eq("org_id", orgId)
        .eq("id", tpl.current_version_id)
        .maybeSingle();
    const v = version as { id: string; version_number: number; subject: string | null; body: string | null } | null;
    if (!v || !str(v.body)) return skip("template_version_empty", { template_id: tpl.id });

    const channelRaw = (str(pl.channel) || str(tpl.channel) || "sms").toLowerCase();
    if (channelRaw !== "sms" && channelRaw !== "email") return skip(`unsupported_channel:${channelRaw}`);
    const channel = channelRaw as "sms" | "email";

    // ---- the recipient: the lead's primary person --------------------------------------------------
    const { data: lead } = await supabase
        .from("opportunities")
        .select("id, customer_id, primary_person_id")
        .eq("org_id", orgId)
        .eq("id", leadId)
        .maybeSingle();
    const l = lead as { id: string; customer_id: string | null; primary_person_id: string | null } | null;
    if (!l?.primary_person_id) return skip("lead_has_no_primary_person");

    const renderContext = await buildRecordRenderContext(supabase, orgId, {
        personId: l.primary_person_id,
        customerId: l.customer_id,
        opportunityId: l.id,
    });
    const send = await canonicalSend({
        supabase,
        orgId,
        authorizingUserId: str(ev.actor_user_id) || null,
        sourceCapability: "workflows.automation",
        recipient: { kind: "person", personId: l.primary_person_id },
        audience: "external",
        category: "operational",
        purpose: AUTOMATION_PURPOSE,
        channel,
        primaryEntityType: "persons",
        primaryEntityId: l.primary_person_id,
        bodyRaw: v.body ?? "",
        bodyIsHtml: false,
        subjectRaw: channel === "email" ? (v.subject ?? null) : null,
        userAuthored: false,
        templateId: tpl.id,
        templateVersion: String(v.version_number),
        renderContext,
        idempotencyKey: `workflow:${input.workflowId}:lead:${l.id}:template:${tpl.id}:${channel}`,
        metadata: {
            source: "workflow_automation",
            workflow_id: input.workflowId,
            opportunity_id: l.id,
            customer_id: l.customer_id,
            // The automation's first contact is contact work; it is recorded on PROVIDER ACCEPTANCE.
            ...(str(ev.actor_user_id) ? { author_user_id: str(ev.actor_user_id), work_consequence: "contact_family_work" } : {}),
        },
    });

    const outputs: Record<string, unknown> = {
        template_id: tpl.id,
        template_version: v.version_number,
        channel,
        outcome: send.outcome,
        communication_message_id: send.messageId ?? null,
        thread_id: send.threadId ?? null,
    };
    if (send.outcome === "duplicate") return skip("already_sent_for_this_lead", outputs);
    if (send.outcome !== "sent_to_queue") return skip(`send_${send.outcome}:${send.reason ?? ""}`, { ...outputs, message: send.message });

    // Hand it to the provider now, then record the contact attempt only if the provider accepted it.
    await triggerBackendMessagesQueue({ workflow_run_id: null, limit: 25 }).catch(() => undefined);
    if (send.messageId) {
        try {
            outputs.contact_attempt = await reconcileContactAttemptOnProviderAcceptance({ supabase, messageId: send.messageId });
        } catch (e) {
            outputs.contact_attempt = { state: "error", error: e instanceof Error ? e.message : String(e) };
        }
    }
    return { status: "completed", log: `send_communication_template: ${channel} queued for lead ${l.id}`, outputs };
}
