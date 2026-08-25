import { NextRequest, NextResponse } from "next/server";

import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { requireAdminOrOps } from "@/lib/adminAuth";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { mintExistingRecordFormLinkForAdmin } from "@/lib/forms/existingRecord/mintExistingRecordFormLinkForAdmin";
import { canonicalSend } from "@/lib/communications/send/canonicalSend";
import { resolvePublicAppOrigin } from "@/lib/publicAppUrl";

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

/**
 * The origin these public/embed links are built on.
 *
 * It is read from the ONE canonical public-origin authority and NOT from the request.
 * These links are copied into emails, texts and third-party pages, so their origin has to
 * be a property of the environment rather than of whichever host the operator's browser
 * happened to reach — and a `Host` / `X-Forwarded-Host` header is caller-supplied, so
 * deriving from it let a spoofed header choose where a recipient's link points.
 */
function deriveEmbedBaseUrl(): string | null {
    const decision = resolvePublicAppOrigin();
    return decision.ok ? decision.origin : null;
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
        embedBaseUrl: deriveEmbedBaseUrl(),
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
        // Each recipient is resolved, classified, rendered, evaluated and
        // enqueued INDEPENDENTLY through the canonical send command.
        const send = await canonicalSend({
            supabase,
            orgId: ctx.orgId,
            authorizingUserId: ctx.userId ?? null,
            sourceCapability: "opportunities.form_deliver",
            recipient: { kind: "person", personId },
            audience: "external",
            category: "transactional",
            purpose: "form_delivery",
            channel,
            primaryEntityType: "opportunities",
            primaryEntityId: opportunityId,
            bodyRaw: textRaw,
            subjectRaw: subjectRawEmail ?? null,
            userAuthored: true,
            // One delivery per (public link, person). A retry of the same
            // delivery returns the existing message instead of sending twice.
            idempotencyKey: `form_deliver:${mint.data.public_link_id}:${personId}`,
            metadata: {
                source: "form_delivery",
                form_id: formDefinitionId,
                form_name: formName,
                opportunity_id: opportunityId,
                author_user_id: ctx.userId ?? null,
            },
        });
        const ok = send.outcome === "sent_to_queue" || send.outcome === "duplicate";
        delivered.push(
            ok
                ? { person_id: personId, ok: true, message_id: send.messageId ?? undefined }
                : { person_id: personId, ok: false, error: send.message },
        );
    }

    const anyOk = delivered.some((d) => d.ok);
    if (!anyOk) {
        // COMPENSATION: nobody received anything, so the minted public link is an orphaned LIVE
        // credential (is_active, no expiry). Deactivate it so a failed delivery leaves Before == After
        // instead of accumulating reachable form tokens on every failure.
        const { error: compErr } = await supabase
            .from("form_public_links")
            .update({ is_active: false })
            .eq("id", mint.data.public_link_id)
            .eq("org_id", ctx.orgId);
        if (compErr) {
            // eslint-disable-next-line no-console -- integrity breach must be observable, never silent
            console.error(
                `form_public_links: COMPENSATION FAILED for link ${mint.data.public_link_id} (org ${ctx.orgId}) — an orphaned live form link may exist: ${compErr.message}`,
            );
        }
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
