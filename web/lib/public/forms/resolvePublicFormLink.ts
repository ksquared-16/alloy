import type { SupabaseClient } from "@supabase/supabase-js";
import { hashFormLinkToken } from "./tokenHash";

export type ResolvedPublicFormLink = {
    linkId: string;
    orgId: string;
    formDefinitionId: string;
    formDefinitionVersionId: string;
    schemaJson: unknown;
    pdfMappingJson: unknown | null;
    expiresAt: string | null;
    allowedEmbedOrigins: string[] | null;
    linkMetadata: Record<string, unknown>;
    formKey: string;
    formName: string;
    formKind: string;
    /** Authored brand tokens (`logo_url`, `brand_name`, `accent_color`) — the theme's one source. */
    formMetadata: unknown;
};

export type ResolvePublicFormLinkFailure =
    | { code: "NOT_FOUND" | "INACTIVE" | "EXPIRED" | "NO_PUBLISHED_VERSION"; message: string };

/**
 * Resolve plaintext token to org + published version + schema. Does not expose org_id to clients (caller strips).
 */
export async function resolvePublicFormLinkByToken(
    supabase: SupabaseClient,
    plaintextToken: string
): Promise<{ ok: true; value: ResolvedPublicFormLink } | { ok: false; error: ResolvePublicFormLinkFailure }> {
    const token_hash = hashFormLinkToken(plaintextToken.trim());
    const { data: link, error } = await supabase
        .from("form_public_links")
        .select(
            "id, org_id, form_definition_id, pinned_form_definition_version_id, is_active, expires_at, allowed_embed_origins, metadata"
        )
        .eq("token_hash", token_hash)
        .maybeSingle();

    if (error || !link) {
        return { ok: false, error: { code: "NOT_FOUND", message: "Invalid or unknown link" } };
    }

    const row = link as {
        id: string;
        org_id: string;
        form_definition_id: string;
        pinned_form_definition_version_id: string | null;
        is_active: boolean;
        expires_at: string | null;
        allowed_embed_origins: string[] | null;
        metadata: Record<string, unknown> | null;
    };

    if (!row.is_active) {
        return { ok: false, error: { code: "INACTIVE", message: "This form link is not active" } };
    }

    if (row.expires_at) {
        const exp = new Date(row.expires_at).getTime();
        if (!Number.isNaN(exp) && exp < Date.now()) {
            return { ok: false, error: { code: "EXPIRED", message: "This form link has expired" } };
        }
    }

    const { data: formDef, error: formErr } = await supabase
        .from("form_definitions")
        .select("id, key, name, kind, is_active, metadata")
        .eq("id", row.form_definition_id)
        .eq("org_id", row.org_id)
        .maybeSingle();

    if (formErr || !formDef) {
        return { ok: false, error: { code: "NOT_FOUND", message: "Form not found" } };
    }

    const fd = formDef as { id: string; key: string; name: string; kind: string; is_active: boolean; metadata?: unknown };
    if (fd.is_active === false) {
        return { ok: false, error: { code: "INACTIVE", message: "This form is archived and no longer accepts submissions" } };
    }

    let versionId: string | null = null;
    let schemaJson: unknown = null;
    let pdfMappingJson: unknown | null = null;

    if (row.pinned_form_definition_version_id) {
        const { data: ver } = await supabase
            .from("form_definition_versions")
            .select("id, status, schema_json, pdf_mapping_json")
            .eq("id", row.pinned_form_definition_version_id)
            .eq("form_definition_id", fd.id)
            .eq("org_id", row.org_id)
            .maybeSingle();
        const v = ver as { id: string; status: string; schema_json: unknown; pdf_mapping_json: unknown | null } | null;
        if (v && v.status === "published") {
            versionId = v.id;
            schemaJson = v.schema_json;
            pdfMappingJson = v.pdf_mapping_json ?? null;
        }
    }

    if (!versionId) {
        const { data: latest } = await supabase
            .from("form_definition_versions")
            .select("id, schema_json, pdf_mapping_json")
            .eq("form_definition_id", fd.id)
            .eq("org_id", row.org_id)
            .eq("status", "published")
            .order("version_number", { ascending: false })
            .limit(1)
            .maybeSingle();
        const lv = latest as
            | { id: string; schema_json: unknown; pdf_mapping_json: unknown | null }
            | null;
        if (lv) {
            versionId = lv.id;
            schemaJson = lv.schema_json;
            pdfMappingJson = lv.pdf_mapping_json ?? null;
        }
    }

    if (!versionId || schemaJson == null) {
        return {
            ok: false,
            error: { code: "NO_PUBLISHED_VERSION", message: "No published form version is available for this link" },
        };
    }

    return {
        ok: true,
        value: {
            linkId: row.id,
            orgId: row.org_id,
            formDefinitionId: fd.id,
            formDefinitionVersionId: versionId,
            schemaJson,
            pdfMappingJson,
            expiresAt: row.expires_at,
            allowedEmbedOrigins: row.allowed_embed_origins,
            linkMetadata: row.metadata ?? {},
            formKey: fd.key,
            formName: fd.name,
            formKind: fd.kind,
            formMetadata: fd.metadata ?? null,
        },
    };
}
