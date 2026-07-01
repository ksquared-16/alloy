import type { SupabaseClient } from "@supabase/supabase-js";
import { assertEntityInOrg } from "@/lib/admin/assertEntityInOrg";
import { dbGetFormDefinition, dbInsertFormPublicLink } from "@/lib/admin/forms/formsAdminDb";
import { hashFormLinkToken } from "@/lib/public/forms/tokenHash";
import { generateSecureFormLinkPlaintext, buildPublicFormEmbedPath } from "@/lib/admin/forms/formPublicLinkToken";
import { mergePublicLinkMetadataForCreate } from "@/lib/forms/intake/defaultPublicLinkMetadata";
import {
    mergeExistingRecordLaunchMetadata,
    type ExistingRecordLaunchInput,
} from "@/lib/forms/existingRecord/existingRecordFormLaunch";

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseUuidOrNull(raw: string): string | null {
    const t = raw.trim();
    return UUID_RE.test(t) ? t : null;
}

export type MintExistingRecordFormLinkResult =
    | {
          ok: true;
          data: {
              public_link_id: string;
              embed_path: string;
              embed_url: string | null;
              plaintext_token: string;
              metadata: Record<string, unknown>;
          };
      }
    | { ok: false; status: number; message: string };

export async function mintExistingRecordFormLinkForAdmin(params: {
    supabase: SupabaseClient;
    orgId: string;
    formDefinitionId: string;
    launch: ExistingRecordLaunchInput;
    embedBaseUrl: string | null;
    clientMetadata?: Record<string, unknown>;
    label?: string | null;
}): Promise<MintExistingRecordFormLinkResult> {
    const formId = parseUuidOrNull(params.formDefinitionId);
    if (!formId) {
        return { ok: false, status: 400, message: "Invalid form_definition_id" };
    }

    const entityId = parseUuidOrNull(params.launch.entityId);
    if (!entityId) {
        return { ok: false, status: 400, message: "Invalid entity_id" };
    }

    const ok = await assertEntityInOrg(params.supabase, params.orgId, params.launch.entityType, entityId);
    if (!ok) {
        return { ok: false, status: 400, message: "Record not found in this organization" };
    }

    const { data: form, error: formErr } = await dbGetFormDefinition(params.supabase, params.orgId, formId);
    if (formErr) return { ok: false, status: 500, message: formErr.message };
    if (!form) return { ok: false, status: 404, message: "Form not found" };

    const formRow = form as { key: string; metadata?: Record<string, unknown> };
    const clientMetadata = { ...(params.clientMetadata ?? {}) };
    delete clientMetadata.prefill_field_map;

    let metadata = await mergePublicLinkMetadataForCreate(params.supabase, {
        orgId: params.orgId,
        formKey: formRow.key,
        formMetadata: formRow.metadata,
        clientMetadata,
    });
    metadata = mergeExistingRecordLaunchMetadata(metadata, {
        ...params.launch,
        entityId,
        label: params.label ?? params.launch.label ?? null,
    });

    const maxAttempts = 5;
    let lastErr: { message?: string; code?: string } | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const plaintextToken = generateSecureFormLinkPlaintext();
        const token_hash = hashFormLinkToken(plaintextToken);
        const token_prefix = plaintextToken.length > 12 ? plaintextToken.slice(0, 12) : plaintextToken;

        const { data: row, error } = await dbInsertFormPublicLink(params.supabase, {
            org_id: params.orgId,
            form_definition_id: formId,
            token_hash,
            token_prefix,
            pinned_form_definition_version_id: null,
            is_active: true,
            expires_at: null,
            allowed_embed_origins: null,
            metadata,
        });

        if (!error && row) {
            const embed_path = buildPublicFormEmbedPath(plaintextToken);
            return {
                ok: true,
                data: {
                    public_link_id: (row as { id: string }).id,
                    embed_path,
                    embed_url: params.embedBaseUrl ? `${params.embedBaseUrl}${embed_path}` : null,
                    plaintext_token: plaintextToken,
                    metadata,
                },
            };
        }

        lastErr = error ?? { message: "unknown" };
        if (lastErr.code === "23505") continue;
        break;
    }

    if (lastErr?.code === "23505") {
        return { ok: false, status: 503, message: "Could not allocate a unique link token; retry" };
    }
    return { ok: false, status: 400, message: lastErr?.message ?? "Insert failed" };
}
