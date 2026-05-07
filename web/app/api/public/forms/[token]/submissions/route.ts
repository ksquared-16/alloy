import { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import { validateFormPayload } from "@/lib/forms/validateSubmission";
import { normalizeValidationErrors } from "@/lib/forms/validateSubmission";
import { ZodError } from "zod";
import { validateFormSchema } from "@/lib/forms/schema";
import { resolvePublicFormLinkByToken } from "@/lib/public/forms/resolvePublicFormLink";
import { isEmbedOriginAllowed, requestEmbedOrigin } from "@/lib/public/forms/embedOrigin";
import { publicErr, publicOk } from "@/lib/public/forms/publicFormResponses";
import { hashClientIp } from "@/lib/public/forms/clientIpHash";
import { mergePublicSubmissionMeta } from "@/lib/public/forms/publicPayloadMeta";
import { stampFormContextFromLinkMetadata } from "@/lib/forms/formContextMode";

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
    const resolved = await resolvePublicFormLinkByToken(supabase, token);
    if (!resolved.ok) {
        const codeMap = { NOT_FOUND: 404, INACTIVE: 403, EXPIRED: 403, NO_PUBLISHED_VERSION: 409 };
        return publicErr(resolved.error.message, codeMap[resolved.error.code] ?? 400, { code: resolved.error.code });
    }

    const ctx = resolved.value;
    const origin = requestEmbedOrigin(request);
    if (!isEmbedOriginAllowed(origin, ctx.allowedEmbedOrigins)) {
        return publicErr("Origin not allowed for this form embed", 403, { code: "ORIGIN_FORBIDDEN" });
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

    try {
        validateFormSchema(ctx.schemaJson);
    } catch (e) {
        if (e instanceof ZodError) {
            return publicErr("Invalid published schema", 500, { validation_errors: normalizeValidationErrors(e) });
        }
        throw e;
    }

    const validated = validateFormPayload({
        schemaJson: ctx.schemaJson,
        payload,
        mode: "draft",
        optionValuesByFieldId,
    });
    if (!validated.ok) {
        return publicErr("Invalid submission payload", 400, { validation_errors: validated.errors });
    }

    const ipHash = hashClientIp(request);
    const mergedPayload = {
        ...validated.payload,
        meta: {
            ...mergePublicSubmissionMeta(validated.payload.meta as Record<string, unknown> | undefined, ipHash),
            ...stampFormContextFromLinkMetadata(ctx.linkMetadata),
        },
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
            metadata: {},
        })
        .select("*")
        .single();

    if (error) return publicErr(error.message, 400);
    const row = data as Record<string, unknown>;
    const { org_id: _omit, ...rest } = row;
    void _omit;
    return publicOk(rest, 201);
}
