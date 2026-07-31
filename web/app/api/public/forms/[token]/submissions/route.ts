import { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { validateFormPayload } from "@/lib/forms/validateSubmission";
import { normalizeValidationErrors } from "@/lib/forms/validateSubmission";
import { ZodError } from "zod";
import { validateFormSchema, type FormSchemaV1 } from "@/lib/forms/schema";
import { mergePrefillIntoDraftValues } from "@/lib/forms/prefill/mergePrefillDraftValues";
import { parsePrefillFieldMapFromMetadata } from "@/lib/forms/prefill/prefillFieldMap";
import { resolveFormPrefillPayload } from "@/lib/forms/prefill/resolveFormPrefillPayload";
import { shouldApplyServerPrefill } from "@/lib/forms/prefill/resolveFormPrefillValues";
import {
    extractCollectionSubmissionEnvelope,
    validateCollectionPayloadContract,
    validateCollectionPayloadOrgSecurity,
} from "@/lib/forms/collection/formsCollectionSubmissionValidation";
import { resolvePublicFormEmbedContext } from "@/lib/public/forms/resolvePublicFormEmbedContext";
import { isEmbedOriginAllowed, requestEmbedOrigin } from "@/lib/public/forms/embedOrigin";
import { publicErr, publicOk } from "@/lib/public/forms/publicFormResponses";
import { hashClientIp } from "@/lib/public/forms/clientIpHash";
import { mergePublicSubmissionMeta } from "@/lib/public/forms/publicPayloadMeta";
import { stampFormContextFromLinkMetadata } from "@/lib/forms/formContextMode";
import { deriveSubmissionFksFromLaunchMetadata } from "@/lib/forms/formLaunchFkDerivation";
import { linkNamesRecipientPerson, resolveParticipantFksForPacketDraft } from "@/lib/forms/packets/formPacketService";
import { filterPayloadValuesToSchemaFields } from "@/lib/forms/filterPayloadValuesToSchema";
import type { FormPayload } from "@/lib/forms/validateSubmission";

function plaintextToken(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

/** POST /api/public/forms/[token]/submissions — create draft tied to public link. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return publicErr("Server misconfiguration", 500);
    }

    const { token: rawToken } = await params;
    const token = plaintextToken(rawToken ?? "");
    if (!token.trim()) return publicErr("Missing token", 400);

    const supabase = createServiceRoleClient();
    const resolved = await resolvePublicFormEmbedContext(supabase, token);
    if (!resolved.ok) {
        const codeMap = { NOT_FOUND: 404, INACTIVE: 403, EXPIRED: 403, NO_PUBLISHED_VERSION: 409 };
        return publicErr(resolved.error.message, codeMap[resolved.error.code] ?? 400, { code: resolved.error.code });
    }

    const ctx = resolved.value;
    const origin = requestEmbedOrigin(request);
    if (!isEmbedOriginAllowed(origin, ctx.allowedEmbedOrigins)) {
        return publicErr("Origin not allowed for this form embed", 403, { code: "ORIGIN_FORBIDDEN" });
    }

    if (ctx.packetTerminal) {
        return publicErr("This enrollment packet is already complete", 409, { code: "PACKET_COMPLETE" });
    }

    if (ctx.schemaJson == null) {
        return publicErr("No form schema available", 409);
    }

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return publicErr("Invalid JSON", 400);
    }

    const payload =
        body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
            ? (body.payload as Record<string, unknown>)
            : { values: {} };

    const optionValuesRaw = body.option_values_by_field_id;
    const optionValuesByFieldId =
        optionValuesRaw &&
        typeof optionValuesRaw === "object" &&
        !Array.isArray(optionValuesRaw) &&
        optionValuesRaw !== null
            ? Object.fromEntries(
                  Object.entries(optionValuesRaw as Record<string, unknown>).map(([k, v]) => [
                      k,
                      Array.isArray(v) ? v.map(String) : [],
                  ])
              )
            : undefined;

    let schema: FormSchemaV1;
    try {
        schema = validateFormSchema(ctx.schemaJson);
    } catch (e) {
        if (e instanceof ZodError) {
            return publicErr("Invalid published schema", 500, { validation_errors: normalizeValidationErrors(e) });
        }
        throw e;
    }

    let launchFks: {
        person_id: string | null;
        customer_id: string | null;
        customer_member_id: string | null;
        opportunity_id: string | null;
    } = {
        person_id: null,
        customer_id: null,
        customer_member_id: null,
        opportunity_id: null,
    };
    try {
        launchFks = await deriveSubmissionFksFromLaunchMetadata(supabase, ctx.orgId, ctx.linkMetadata);
    } catch (e) {
        return publicErr(e instanceof Error ? e.message : "Launch metadata resolve failed", 400);
    }

    let packetSessionRow: { shared_values: unknown; crm_snapshot: unknown } | null = null;
    // Participant attribution: on a Family Packet the resolving link owns WHO is answering, so a
    // shared session's snapshot never overrides it. See resolveParticipantFksForPacketDraft.
    const namesRecipient = linkNamesRecipientPerson(ctx.linkMetadata);
    if (ctx.packet) {
        const { data: psRow } = await supabase
            .from("form_packet_sessions")
            .select("shared_values, crm_snapshot")
            .eq("id", ctx.packet.packet_session_id)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        packetSessionRow = psRow ?? null;
        const snap =
            packetSessionRow?.crm_snapshot &&
            typeof packetSessionRow.crm_snapshot === "object" &&
            !Array.isArray(packetSessionRow.crm_snapshot)
                ? (packetSessionRow.crm_snapshot as Record<string, unknown>)
                : {};
        launchFks = resolveParticipantFksForPacketDraft({
            launchFks,
            crmSnapshot: snap,
            linkNamesRecipient: namesRecipient,
        });
    }

    let clientVals = (payload.values ?? {}) as Record<string, unknown>;
    if (ctx.packet && packetSessionRow) {
        const sv = (packetSessionRow.shared_values ?? {}) as Record<string, unknown>;
        clientVals = { ...sv, ...clientVals };
    }

    if (ctx.packet) {
        const { data: siRow } = await supabase
            .from("form_packet_session_items")
            .select("form_submission_id")
            .eq("id", ctx.packet.current_session_item_id)
            .eq("org_id", ctx.orgId)
            .maybeSingle();
        const existingSid = siRow?.form_submission_id as string | null | undefined;
        if (existingSid) {
            const { data: exSub } = await supabase
                .from("form_submissions")
                .select("*")
                .eq("id", existingSid)
                .eq("org_id", ctx.orgId)
                .eq("status", "draft")
                .maybeSingle();
            if (exSub) {
                const full = exSub as Record<string, unknown>;
                const { org_id: _o, ...rest } = full;
                void _o;
                return publicOk(rest, 201);
            }
        }
    }

    let serverPrefill: Record<string, string | number | boolean> = {};
    let mergedPayloadForValidation: FormPayload = {
        values: clientVals,
        groups: payload.groups as FormPayload["groups"],
        signatures: payload.signatures as FormPayload["signatures"],
        meta: payload.meta as FormPayload["meta"],
    };
    if (shouldApplyServerPrefill(ctx.linkMetadata)) {
        try {
            let fdRecord: Record<string, unknown> | null = null;
            const linkHasPrefillMap = parsePrefillFieldMapFromMetadata(ctx.linkMetadata.prefill_field_map) != null;
            if (!linkHasPrefillMap) {
                const { data: fdRow, error: fdErr } = await supabase
                    .from("form_definitions")
                    .select("metadata")
                    .eq("id", ctx.formDefinitionId)
                    .eq("org_id", ctx.orgId)
                    .maybeSingle();
                if (fdErr) return publicErr(fdErr.message, 400);
                const fdMeta = (fdRow as { metadata?: unknown } | null)?.metadata;
                fdRecord =
                    fdMeta && typeof fdMeta === "object" && !Array.isArray(fdMeta)
                        ? (fdMeta as Record<string, unknown>)
                        : null;
            }
            const prefillResult = await resolveFormPrefillPayload({
                supabase,
                orgId: ctx.orgId,
                linkMetadata: ctx.linkMetadata,
                formDefinitionMetadata: fdRecord,
                schema,
                launchFks,
                savedPayload: {
                    values: clientVals,
                    groups: (payload.groups as FormPayload["groups"]) ?? undefined,
                },
            });
            serverPrefill = prefillResult.scalarPrefill;
            mergedPayloadForValidation = {
                values: prefillResult.payload.values ?? {},
                groups: prefillResult.payload.groups,
                signatures: payload.signatures as FormPayload["signatures"],
                meta: payload.meta as FormPayload["meta"],
            };
        } catch (e) {
            return publicErr(e instanceof Error ? e.message : "Prefill resolve failed", 400);
        }
    }

    let mergedValues = mergePrefillIntoDraftValues(schema, clientVals, serverPrefill);
    if (ctx.packet) {
        mergedValues = filterPayloadValuesToSchemaFields(schema, mergedValues);
    }

    const draftPayload = {
        ...mergedPayloadForValidation,
        values: mergedValues,
    };

    const collectionContractErrors = validateCollectionPayloadContract(schema, draftPayload, "draft");
    if (collectionContractErrors.length > 0) {
        return publicErr("Invalid collection payload", 400, { validation_errors: collectionContractErrors });
    }

    const collectionSecurityErrors = await validateCollectionPayloadOrgSecurity(
        supabase,
        ctx.orgId,
        schema,
        draftPayload,
        launchFks,
    );
    if (collectionSecurityErrors.length > 0) {
        return publicErr("Invalid collection item reference", 403, { validation_errors: collectionSecurityErrors });
    }

    const validated = validateFormPayload({
        schemaJson: ctx.schemaJson,
        payload: draftPayload,
        mode: "draft",
        optionValuesByFieldId,
    });
    if (!validated.ok) {
        return publicErr("Invalid submission payload", 400, { validation_errors: validated.errors });
    }

    const ipHash = hashClientIp(request);
    const metaStamp: Record<string, unknown> = {
        ...mergePublicSubmissionMeta(validated.payload.meta as Record<string, unknown> | undefined, ipHash),
        ...stampFormContextFromLinkMetadata(ctx.linkMetadata),
    };
    if (ctx.packet) {
        metaStamp.packet_session_id = ctx.packet.packet_session_id;
    }
    if (Object.keys(serverPrefill).length > 0) {
        metaStamp.prefill_snapshot = serverPrefill;
        metaStamp.prefill_applied = true;
    }
    const collectionEnvelope = extractCollectionSubmissionEnvelope(validated.payload);
    if (Object.keys(collectionEnvelope).length > 0) {
        metaStamp.collection_submission_envelope = collectionEnvelope;
    }

    const mergedPayload = {
        ...validated.payload,
        meta: metaStamp,
    };

    const { data, error } = await supabase
        .from("form_submissions")
        .insert({
            org_id: ctx.orgId,
            form_definition_id: ctx.formDefinitionId,
            form_definition_version_id: ctx.formDefinitionVersionId,
            status: "draft",
            payload: mergedPayload as unknown as Record<string, unknown>,
            created_via_public_link_id: ctx.linkId,
            // Provenance only — never a product-level distinction a consumer may branch on.
            metadata: ctx.packet && namesRecipient && launchFks.person_id
                ? { participant_attribution: { person_id: launchFks.person_id, source: "resolving_link" } }
                : {},
            person_id: launchFks.person_id,
            customer_id: launchFks.customer_id,
            customer_member_id: launchFks.customer_member_id,
            opportunity_id: launchFks.opportunity_id,
        })
        .select("*")
        .single();

    if (error) return publicErr(error.message, 400);
    const row = data as Record<string, unknown>;

    if (ctx.packet) {
        const { error: upSiErr } = await supabase
            .from("form_packet_session_items")
            .update({ form_submission_id: row.id as string })
            .eq("id", ctx.packet.current_session_item_id)
            .eq("org_id", ctx.orgId);
        if (upSiErr) return publicErr(upSiErr.message, 400);
    }

    const { org_id: _omit, ...rest } = row;
    void _omit;
    return publicOk(rest, 201);
}
