import { NextRequest } from "next/server";
import { ZodError } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/serverServiceClient";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import { validateFormSchema } from "@/lib/forms/schema";
import { normalizeValidationErrors } from "@/lib/forms/validateSubmission";
import { hydrateSelectOptionsForSchema } from "@/lib/public/forms/hydratePublicFormSelectOptions";
import { resolvePublicFormEmbedContext } from "@/lib/public/forms/resolvePublicFormEmbedContext";
import { isEmbedOriginAllowed, requestEmbedOrigin } from "@/lib/public/forms/embedOrigin";
import { publicErr, publicOk } from "@/lib/public/forms/publicFormResponses";

function plaintextToken(raw: string): string {
    try {
        return decodeURIComponent(raw);
    } catch {
        return raw;
    }
}

/** GET /api/public/forms/[token]/resolve — bootstrap schema + version for embed/mobile. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
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

    const v = resolved.value;
    const origin = requestEmbedOrigin(request);
    if (!isEmbedOriginAllowed(origin, v.allowedEmbedOrigins)) {
        return publicErr("Origin not allowed for this form embed", 403, { code: "ORIGIN_FORBIDDEN" });
    }

    if (v.packetTerminal) {
        return publicOk({
            packet_terminal: true,
            packet: v.packet,
            form_definition_id: v.formDefinitionId,
            form_definition_version_id: v.formDefinitionVersionId,
            schema_json: null,
            pdf_mapping_json: null,
            form: { key: v.formKey, name: v.formName, kind: v.formKind },
            link: {
                expires_at: v.expiresAt,
                allowed_embed_origins: v.allowedEmbedOrigins,
                metadata: v.linkMetadata,
            },
            option_values_by_field_id: {},
            option_choices_by_field_id: {},
        });
    }

    let schema: FormSchemaV1;
    try {
        schema = validateFormSchema(v.schemaJson);
    } catch (e) {
        if (e instanceof ZodError) {
            return publicErr("Invalid published schema", 500, {
                validation_errors: normalizeValidationErrors(e),
                code: "INVALID_SCHEMA",
            });
        }
        throw e;
    }

    const hydrated = await hydrateSelectOptionsForSchema(supabase, v.orgId, schema);

    return publicOk({
        form_definition_id: v.formDefinitionId,
        form_definition_version_id: v.formDefinitionVersionId,
        schema_json: v.schemaJson,
        pdf_mapping_json: v.pdfMappingJson,
        form: { key: v.formKey, name: v.formName, kind: v.formKind },
        link: {
            expires_at: v.expiresAt,
            allowed_embed_origins: v.allowedEmbedOrigins,
            metadata: v.linkMetadata,
        },
        packet: v.packet,
        packet_terminal: false,
        option_values_by_field_id: hydrated.option_values_by_field_id,
        option_choices_by_field_id: hydrated.option_choices_by_field_id,
    });
}
