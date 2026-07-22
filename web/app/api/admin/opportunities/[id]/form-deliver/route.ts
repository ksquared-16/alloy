import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { mintExistingRecordFormLinkForAdmin } from "@/lib/forms/existingRecord/mintExistingRecordFormLinkForAdmin";
import { executeCommunicationsSend } from "@/lib/communications/executeCommunicationsSend";

/**
 * Generic form DELIVERY execution (v1, on existing comms + form-link infra).
 *
 * Answers the four contract questions from configuration/selection: which form, who receives it,
 * what/who it relates to, how it's delivered. Reuses:
 *  - mintExistingRecordFormLinkForAdmin → the canonical form link (related subjects stamped into
 *    link metadata),
 *  - executeCommunicationsSend → the canonical email/SMS send that records
 *    communication_threads/messages + the activity event and drives recomposition.
 *
 * No entity-type branching: recipients are person ids, subjects are opaque {entity_type,id} pairs.
 * When a channel cannot execute (no recipients for email/sms), it fails with a structured error so
 * the caller renders blocked — never a fake success.
 */

type DeliverChannel = "email" | "sms" | "link";

function deriveEmbedBaseUrl(request: NextRequest): string | null {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return host ? `${proto}://${host}` : null;
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const forbidden = await requireAdminOrOps();
    if (forbidden) return forbidden;
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id: rawId } = await context.params;
    const opportunityId = parseUuidParam(rawId, "id");
    if (opportunityId instanceof NextResponse) return opportunityId;

    const body = (await request.json().catch(() => null)) as {
        form_definition_id?: string;
        recipient_person_ids?: unknown;
        subject_ids?: unknown;
        channel?: string;
        message?: string;
    } | null;
    if (!body) return jsonError("Invalid request body.", 400);

    const formDefinitionId = typeof body.form_definition_id === "string" ? body.form_definition_id.trim() : "";
    if (!formDefinitionId) return jsonError("A form is required.", 400);

    const channel: DeliverChannel =
        body.channel === "sms" ? "sms" : body.channel === "link" ? "link" : "email";
    const recipientPersonIds = Array.isArray(body.recipient_person_ids)
        ? body.recipient_person_ids.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        : [];
    const subjectIds = Array.isArray(body.subject_ids)
        ? body.subject_ids.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        : [];

    if (channel !== "link" && recipientPersonIds.length === 0) {
        return jsonError("Select at least one recipient to send the form.", 400);
    }

    const supabase = createAdminClient();

    // Resolve the form name (operator-facing subject/body copy).
    const { data: formRow } = await supabase
        .from("form_definitions")
        .select("name")
        .eq("org_id", ctx.orgId)
        .eq("id", formDefinitionId)
        .maybeSingle();
    const formName = (formRow as { name?: string } | null)?.name?.trim() || "form";

    // Mint the canonical form link (related subjects stamped into link metadata).
    const mint = await mintExistingRecordFormLinkForAdmin({
        supabase,
        orgId: ctx.orgId,
        formDefinitionId,
        launch: { entityType: "opportunity", entityId: opportunityId, label: formName },
        embedBaseUrl: deriveEmbedBaseUrl(request),
        clientMetadata: subjectIds.length > 0 ? { form_delivery_subject_ids: subjectIds } : undefined,
    });
    if (!mint.ok) return jsonError(mint.message, mint.status);

    const link = mint.data.embed_url ?? mint.data.embed_path;

    if (channel === "link") {
        return jsonData(
            {
                ok: true,
                channel,
                public_link_id: mint.data.public_link_id,
                embed_url: mint.data.embed_url,
                embed_path: mint.data.embed_path,
                subject_ids: subjectIds,
                delivered: [] as Array<{ person_id: string; ok: boolean; message_id?: string; error?: string }>,
            },
            { status: 201 },
        );
    }

    const subjectRawEmail = channel === "email" ? `Please complete: ${formName}` : undefined;
    const customMessage = typeof body.message === "string" ? body.message.trim() : "";
    const textRaw = `${customMessage ? `${customMessage}\n\n` : ""}Please complete this form: ${link}`;

    const delivered: Array<{ person_id: string; ok: boolean; message_id?: string; error?: string }> = [];
    for (const personId of recipientPersonIds) {
        const exec = await executeCommunicationsSend({
            supabase,
            orgId: ctx.orgId,
            quickMessage: false,
            primaryEntityType: "opportunities",
            primaryEntityId: opportunityId,
            channel,
            textRaw,
            subjectRawEmail,
            bindingIdOpt: "",
            recipientPersonIdRaw: personId,
            toRawInput: "",
            sendMetadataAugment: {
                form_delivery: { public_link_id: mint.data.public_link_id, form_definition_id: formDefinitionId, subject_ids: subjectIds },
            },
        });
        delivered.push(
            exec.ok
                ? { person_id: personId, ok: true, message_id: exec.communication_message_id }
                : { person_id: personId, ok: false, error: exec.error },
        );
    }

    const anyOk = delivered.some((d) => d.ok);
    if (!anyOk) {
        return jsonError(delivered[0]?.error ?? "Form delivery failed for all recipients.", 502);
    }

    return jsonData(
        {
            ok: true,
            channel,
            public_link_id: mint.data.public_link_id,
            embed_url: mint.data.embed_url,
            subject_ids: subjectIds,
            delivered,
        },
        { status: 201 },
    );
}
