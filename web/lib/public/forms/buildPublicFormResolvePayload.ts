/**
 * The public form "resolve" payload, shared by the API route and the embed page's server render.
 *
 * The embed page used to render an empty shell that hydrated and only THEN fetched
 * `/api/public/forms/[token]/resolve`, so every embedded form showed a blank iframe for a full
 * hydrate + round-trip before anything appeared. Server-rendering the same payload removes that
 * waterfall. Extracting it here keeps one implementation — the page must never resolve forms by a
 * looser rule than the API does.
 */

import { resolveParticipantBrand } from "@/lib/public/forms/participantBrandTheme";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ZodError } from "zod";
import type { FormSchemaV1 } from "@/lib/forms/schema";
import { validateFormSchema } from "@/lib/forms/schema";
import { normalizeValidationErrors } from "@/lib/forms/validateSubmission";
import { hydrateSelectOptionsForSchema } from "@/lib/public/forms/hydratePublicFormSelectOptions";
import { resolvePublicFormEmbedContext } from "@/lib/public/forms/resolvePublicFormEmbedContext";
import { isEmbedOriginAllowed } from "@/lib/public/forms/embedOrigin";

export type PublicFormResolveErrorCode =
    | "NOT_FOUND"
    | "INACTIVE"
    | "EXPIRED"
    | "NO_PUBLISHED_VERSION"
    | "ORIGIN_FORBIDDEN"
    | "INVALID_SCHEMA";

export type PublicFormResolveResult =
    | { ok: true; data: Record<string, unknown> }
    | {
          ok: false;
          status: number;
          message: string;
          code?: PublicFormResolveErrorCode;
          validation_errors?: ReturnType<typeof normalizeValidationErrors>;
      };

const STATUS_BY_CODE: Record<string, number> = {
    NOT_FOUND: 404,
    INACTIVE: 403,
    EXPIRED: 403,
    NO_PUBLISHED_VERSION: 409,
};

/**
 * Resolve a public form for an embed request.
 *
 * `requestOrigin` is enforced against the link's allowlist exactly as the API does — a null origin
 * passes only when the link has no allowlist, which is the existing rule for direct navigation.
 */
export async function buildPublicFormResolvePayload(
    supabase: SupabaseClient,
    token: string,
    requestOrigin: string | null
): Promise<PublicFormResolveResult> {
    if (!token.trim()) return { ok: false, status: 400, message: "Missing token" };

    const resolved = await resolvePublicFormEmbedContext(supabase, token);
    if (!resolved.ok) {
        return {
            ok: false,
            status: STATUS_BY_CODE[resolved.error.code] ?? 400,
            message: resolved.error.message,
            code: resolved.error.code as PublicFormResolveErrorCode,
        };
    }

    const v = resolved.value;
    if (!isEmbedOriginAllowed(requestOrigin, v.allowedEmbedOrigins)) {
        return {
            ok: false,
            status: 403,
            message: "Origin not allowed for this form embed",
            code: "ORIGIN_FORBIDDEN",
        };
    }

    if (v.packetTerminal) {
        return {
            ok: true,
            data: {
                packet_terminal: true,
                packet: v.packet,
                form_definition_id: v.formDefinitionId,
                form_definition_version_id: v.formDefinitionVersionId,
                schema_json: null,
                pdf_mapping_json: null,
                form: { key: v.formKey, name: v.formName, kind: v.formKind },
                brand: resolveParticipantBrand(v.formMetadata),
                link: {
                    expires_at: v.expiresAt,
                    allowed_embed_origins: v.allowedEmbedOrigins,
                    metadata: v.linkMetadata,
                },
                option_values_by_field_id: {},
                option_choices_by_field_id: {},
            },
        };
    }

    let schema: FormSchemaV1;
    try {
        schema = validateFormSchema(v.schemaJson);
    } catch (e) {
        if (e instanceof ZodError) {
            return {
                ok: false,
                status: 500,
                message: "Invalid published schema",
                code: "INVALID_SCHEMA",
                validation_errors: normalizeValidationErrors(e),
            };
        }
        throw e;
    }

    const hydrated = await hydrateSelectOptionsForSchema(supabase, v.orgId, schema);

    return {
        ok: true,
        data: {
            form_definition_id: v.formDefinitionId,
            form_definition_version_id: v.formDefinitionVersionId,
            schema_json: v.schemaJson,
            pdf_mapping_json: v.pdfMappingJson,
            form: { key: v.formKey, name: v.formName, kind: v.formKind },
            brand: resolveParticipantBrand(v.formMetadata),
            link: {
                expires_at: v.expiresAt,
                allowed_embed_origins: v.allowedEmbedOrigins,
                metadata: v.linkMetadata,
            },
            packet: v.packet,
            packet_terminal: false,
            option_values_by_field_id: hydrated.option_values_by_field_id,
            option_choices_by_field_id: hydrated.option_choices_by_field_id,
        },
    };
}
