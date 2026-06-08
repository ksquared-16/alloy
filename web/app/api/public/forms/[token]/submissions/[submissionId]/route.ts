import { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { validateFormPayload } from "@/lib/forms/validateSubmission";
import { validateFormSchema, type FormSchemaV1 } from "@/lib/forms/schema";
import { filterPayloadValuesToSchemaFields } from "@/lib/forms/filterPayloadValuesToSchema";
import { normalizeValidationErrors } from "@/lib/forms/validateSubmission";
import { ZodError } from "zod";
import { resolvePublicFormEmbedContext } from "@/lib/public/forms/resolvePublicFormEmbedContext";
import { verifySubmissionBelongsToPublicEmbed } from "@/lib/public/forms/publicEmbedSubmissionGuard";
import { isEmbedOriginAllowed, requestEmbedOrigin } from "@/lib/public/forms/embedOrigin";
import { publicErr, publicOk } from "@/lib/public/forms/publicFormResponses";
import { hashClientIp } from "@/lib/public/forms/clientIpHash";
import { mergePublicSubmissionMeta } from "@/lib/public/forms/publicPayloadMeta";
import { applyReadOnlyBaselineToPayload } from "@/lib/forms/readOnlyFormPayload";
import { emitOpportunityEnrollmentPacketOpenedSafe } from "@/lib/forms/workflow/opportunityEnrollmentPacketProjections";
import type { FormPayload } from "@/lib/forms/validateSubmission";

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** GET — recover draft payload for embed reload (token-protected). */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ token: string; submissionId: string }> }
) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return publicErr("Server misconfiguration", 500);
    }

    const { token: rawToken, submissionId } = await params;
    if (!submissionId || !UUID_RE.test(submissionId)) return publicErr("Invalid submission id", 400);

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
        return publicErr("Packet already completed", 409, { code: "PACKET_COMPLETE" });
    }

    const gate = await verifySubmissionBelongsToPublicEmbed(supabase, ctx, submissionId);
    if (!gate.ok) return publicErr(gate.message, gate.status);

    const existing = gate.row;
    const row = existing as { status: string };
    if (row.status !== "draft") {
        return publicErr("Submission is not editable", 409, { code: "NOT_DRAFT" });
    }

    const full = existing as Record<string, unknown>;
    const { org_id: _o, ...rest } = full;
    void _o;
    return publicOk(rest);
}

function plaintextToken(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

/** PATCH /api/public/forms/[token]/submissions/[submissionId] — update draft payload */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ token: string; submissionId: string }> }
) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return publicErr("Server misconfiguration", 500);
    }

    const { token: rawToken, submissionId } = await params;
    if (!submissionId || !UUID_RE.test(submissionId)) return publicErr("Invalid submission id", 400);

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
        return publicErr("Packet already completed", 409, { code: "PACKET_COMPLETE" });
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
            : null;
    if (!payload) return publicErr("payload is required", 400);

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

    const gate = await verifySubmissionBelongsToPublicEmbed(supabase, ctx, submissionId);
    if (!gate.ok) return publicErr(gate.message, gate.status);

    const existing = gate.row;
    const row = existing as { status: string };
    if (row.status !== "draft") {
        return publicErr("Only draft submissions can be updated", 409, { code: "NOT_DRAFT" });
    }

    const { data: ver } = await supabase
        .from("form_definition_versions")
        .select("schema_json")
        .eq("id", ctx.formDefinitionVersionId)
        .maybeSingle();
    const schemaJson = (ver as { schema_json?: unknown } | null)?.schema_json ?? ctx.schemaJson;

    let schema: FormSchemaV1;
    try {
        schema = validateFormSchema(schemaJson);
    } catch (e) {
        if (e instanceof ZodError) {
            return publicErr("Invalid published schema", 500, { validation_errors: normalizeValidationErrors(e) });
        }
        throw e;
    }

    let payloadForValidate: Record<string, unknown> = payload;
    if (ctx.packet) {
        payloadForValidate = {
            ...payload,
            values: filterPayloadValuesToSchemaFields(schema, (payload.values ?? {}) as Record<string, unknown>),
        };
    }

    const validated = validateFormPayload({
        schemaJson,
        payload: payloadForValidate,
        mode: "draft",
        optionValuesByFieldId,
    });
    if (!validated.ok) {
        return publicErr("Invalid submission payload", 400, { validation_errors: validated.errors });
    }

    const existingPayload = (existing as { payload: FormPayload }).payload;
    const guardedPayload = applyReadOnlyBaselineToPayload(validated.schema, validated.payload, existingPayload);

    const ipHash = hashClientIp(request);
    const mergedPayload = {
        ...guardedPayload,
        meta: mergePublicSubmissionMeta(guardedPayload.meta as Record<string, unknown> | undefined, ipHash),
    };

    const { data: updated, error: upErr } = await supabase
        .from("form_submissions")
        .update({ payload: mergedPayload as unknown as Record<string, unknown> })
        .eq("id", submissionId)
        .eq("org_id", ctx.orgId)
        .eq("created_via_public_link_id", ctx.linkId)
        .eq("status", "draft")
        .select("*")
        .single();

    if (upErr) return publicErr(upErr.message, 400);
    const out = updated as Record<string, unknown>;
    const { org_id: _o, ...rest } = out;
    void _o;
    if (ctx.packet) {
        const oe = await emitOpportunityEnrollmentPacketOpenedSafe({
            orgId: ctx.orgId,
            packetSessionId: ctx.packet.packet_session_id,
        });
        if (oe.error) {
            console.error("[public PATCH submission] enrollment opened projection failed:", oe.error.message);
        }
    }
    return publicOk(rest);
}
