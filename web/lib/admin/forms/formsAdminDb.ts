import type { SupabaseClient } from "@supabase/supabase-js";

export type FormDefinitionRow = {
    id: string;
    org_id: string;
    key: string;
    name: string;
    description: string | null;
    kind: string;
    is_active: boolean;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string | null;
};

export type FormDefinitionVersionRow = {
    id: string;
    form_definition_id: string;
    org_id: string;
    version_number: number;
    status: string;
    schema_json: unknown;
    pdf_mapping_json: unknown | null;
    published_at: string | null;
    published_by_user_id: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string | null;
};

export type FormSubmissionRow = {
    id: string;
    org_id: string;
    form_definition_id: string;
    form_definition_version_id: string;
    status: string;
    payload: Record<string, unknown>;
    person_id: string | null;
    customer_id: string | null;
    customer_member_id: string | null;
    opportunity_id: string | null;
    created_via_public_link_id: string | null;
    created_by_user_id: string | null;
    submitted_by_user_id: string | null;
    submitted_at: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string | null;
};

export async function dbListFormDefinitions(supabase: SupabaseClient, orgId: string) {
    return supabase.from("form_definitions").select("*").eq("org_id", orgId).order("key", { ascending: true });
}

/** IDs of definitions that have ≥1 published version (hub list enrichment; single query per org). */
export async function dbListFormIdsWithPublishedVersion(supabase: SupabaseClient, orgId: string) {
    return supabase
        .from("form_definition_versions")
        .select("form_definition_id")
        .eq("org_id", orgId)
        .eq("status", "published");
}

export async function dbInsertFormDefinition(
    supabase: SupabaseClient,
    row: {
        org_id: string;
        key: string;
        name: string;
        kind: string;
        description?: string | null;
        is_active?: boolean;
        metadata?: Record<string, unknown>;
    }
) {
    return supabase
        .from("form_definitions")
        .insert({
            org_id: row.org_id,
            key: row.key,
            name: row.name,
            kind: row.kind,
            description: row.description ?? null,
            is_active: row.is_active ?? true,
            metadata: row.metadata ?? {},
        })
        .select("*")
        .single();
}

export async function dbGetFormDefinition(supabase: SupabaseClient, orgId: string, formId: string) {
    return supabase.from("form_definitions").select("*").eq("org_id", orgId).eq("id", formId).maybeSingle();
}

export async function dbUpdateFormDefinition(
    supabase: SupabaseClient,
    orgId: string,
    formId: string,
    patch: {
        name?: string;
        description?: string | null;
        kind?: string;
        is_active?: boolean;
        metadata?: Record<string, unknown>;
    }
) {
    return supabase.from("form_definitions").update(patch).eq("org_id", orgId).eq("id", formId).select("*").single();
}

export async function dbListVersionsForForm(supabase: SupabaseClient, orgId: string, formId: string) {
    return supabase
        .from("form_definition_versions")
        .select("id, version_number, status, published_at, created_at, updated_at, pdf_mapping_json")
        .eq("org_id", orgId)
        .eq("form_definition_id", formId)
        .order("version_number", { ascending: false });
}

export async function dbGetVersion(supabase: SupabaseClient, orgId: string, versionId: string) {
    return supabase.from("form_definition_versions").select("*").eq("org_id", orgId).eq("id", versionId).maybeSingle();
}

export async function dbMaxVersionNumber(supabase: SupabaseClient, formId: string): Promise<number> {
    const { data, error } = await supabase
        .from("form_definition_versions")
        .select("version_number")
        .eq("form_definition_id", formId)
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw new Error(error.message);
    const n = (data as { version_number?: number } | null)?.version_number;
    return typeof n === "number" ? n : 0;
}

export async function dbInsertVersion(
    supabase: SupabaseClient,
    row: {
        form_definition_id: string;
        org_id: string;
        version_number: number;
        status: string;
        schema_json: unknown;
        pdf_mapping_json?: unknown | null;
        metadata?: Record<string, unknown>;
    }
) {
    return supabase
        .from("form_definition_versions")
        .insert({
            form_definition_id: row.form_definition_id,
            org_id: row.org_id,
            version_number: row.version_number,
            status: row.status,
            schema_json: row.schema_json,
            pdf_mapping_json: row.pdf_mapping_json ?? null,
            metadata: row.metadata ?? {},
        })
        .select("*")
        .single();
}

export async function dbUpdateVersionDraft(
    supabase: SupabaseClient,
    orgId: string,
    versionId: string,
    patch: {
        schema_json?: unknown;
        pdf_mapping_json?: unknown | null;
        metadata?: Record<string, unknown>;
    }
) {
    return supabase
        .from("form_definition_versions")
        .update(patch)
        .eq("org_id", orgId)
        .eq("id", versionId)
        .eq("status", "draft")
        .select("*")
        .single();
}

export async function dbPublishVersion(
    supabase: SupabaseClient,
    orgId: string,
    versionId: string,
    publishedByUserId: string
) {
    return supabase
        .from("form_definition_versions")
        .update({
            status: "published",
            published_at: new Date().toISOString(),
            published_by_user_id: publishedByUserId,
        })
        .eq("org_id", orgId)
        .eq("id", versionId)
        .eq("status", "draft")
        .select("*")
        .single();
}

export async function dbArchiveVersion(supabase: SupabaseClient, orgId: string, versionId: string) {
    return supabase
        .from("form_definition_versions")
        .update({ status: "archived" })
        .eq("org_id", orgId)
        .eq("id", versionId)
        .eq("status", "published")
        .select("*")
        .single();
}

export async function dbListSubmissions(
    supabase: SupabaseClient,
    orgId: string,
    filters: {
        form_definition_id?: string;
        form_definition_version_id?: string;
        status?: string;
        person_id?: string;
        customer_id?: string;
        customer_member_id?: string;
        opportunity_id?: string;
        limit?: number;
    }
) {
    let q = supabase
        .from("form_submissions")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(filters.limit ?? 100);
    if (filters.form_definition_id) q = q.eq("form_definition_id", filters.form_definition_id);
    if (filters.form_definition_version_id) q = q.eq("form_definition_version_id", filters.form_definition_version_id);
    if (filters.status) q = q.eq("status", filters.status);
    if (filters.person_id) q = q.eq("person_id", filters.person_id);
    if (filters.customer_id) q = q.eq("customer_id", filters.customer_id);
    if (filters.customer_member_id) q = q.eq("customer_member_id", filters.customer_member_id);
    if (filters.opportunity_id) q = q.eq("opportunity_id", filters.opportunity_id);
    return q;
}

export async function dbGetSubmission(supabase: SupabaseClient, orgId: string, submissionId: string) {
    return supabase.from("form_submissions").select("*").eq("org_id", orgId).eq("id", submissionId).maybeSingle();
}

export type FormSubmissionLinkedDocument = {
    role: string;
    junction_created_at: string;
    document: {
        id: string;
        name: string | null;
        original_filename: string | null;
        document_type: string | null;
        status: string | null;
        created_at: string | null;
    };
};

/** Junction rows joined to `documents` for admin submission review (org-scoped). */
export async function dbListSubmissionLinkedDocuments(
    supabase: SupabaseClient,
    orgId: string,
    submissionId: string
): Promise<{ data: FormSubmissionLinkedDocument[] | null; error: { message: string } | null }> {
    const { data: junctions, error: jErr } = await supabase
        .from("form_submission_documents")
        .select("document_id, role, created_at")
        .eq("org_id", orgId)
        .eq("form_submission_id", submissionId)
        .order("created_at", { ascending: true });
    if (jErr) return { data: null, error: jErr };
    const ids = [...new Set((junctions ?? []).map((r: { document_id: string }) => r.document_id))];
    if (ids.length === 0) return { data: [], error: null };

    const { data: docs, error: dErr } = await supabase
        .from("documents")
        .select("id, name, original_filename, document_type, status, created_at")
        .eq("org_id", orgId)
        .in("id", ids);
    if (dErr) return { data: null, error: dErr };

    const docById = new Map((docs ?? []).map((d: { id: string }) => [d.id, d]));
    const out: FormSubmissionLinkedDocument[] = [];
    for (const j of junctions ?? []) {
        const row = j as { document_id: string; role: string; created_at: string };
        const doc = docById.get(row.document_id) as
            | {
                  id: string;
                  name: string | null;
                  original_filename: string | null;
                  document_type: string | null;
                  status: string | null;
                  created_at: string | null;
              }
            | undefined;
        if (!doc) continue;
        out.push({
            role: row.role,
            junction_created_at: row.created_at,
            document: {
                id: doc.id,
                name: doc.name,
                original_filename: doc.original_filename,
                document_type: doc.document_type,
                status: doc.status,
                created_at: doc.created_at,
            },
        });
    }
    return { data: out, error: null };
}

export async function dbInsertSubmission(
    supabase: SupabaseClient,
    row: {
        org_id: string;
        form_definition_id: string;
        form_definition_version_id: string;
        status: string;
        payload: Record<string, unknown>;
        person_id?: string | null;
        customer_id?: string | null;
        customer_member_id?: string | null;
        opportunity_id?: string | null;
        created_via_public_link_id?: string | null;
        created_by_user_id?: string | null;
        metadata?: Record<string, unknown>;
    }
) {
    return supabase
        .from("form_submissions")
        .insert({
            org_id: row.org_id,
            form_definition_id: row.form_definition_id,
            form_definition_version_id: row.form_definition_version_id,
            status: row.status,
            payload: row.payload,
            person_id: row.person_id ?? null,
            customer_id: row.customer_id ?? null,
            customer_member_id: row.customer_member_id ?? null,
            opportunity_id: row.opportunity_id ?? null,
            created_via_public_link_id: row.created_via_public_link_id ?? null,
            created_by_user_id: row.created_by_user_id ?? null,
            metadata: row.metadata ?? {},
        })
        .select("*")
        .single();
}

export async function dbSubmitSubmission(
    supabase: SupabaseClient,
    orgId: string,
    submissionId: string,
    payload: Record<string, unknown>,
    submittedByUserId: string
) {
    return supabase
        .from("form_submissions")
        .update({
            status: "submitted",
            payload,
            submitted_at: new Date().toISOString(),
            submitted_by_user_id: submittedByUserId,
        })
        .eq("org_id", orgId)
        .eq("id", submissionId)
        .eq("status", "draft")
        .select("*")
        .single();
}

const FORM_PUBLIC_LINK_SAFE_SELECT =
    "id, form_definition_id, pinned_form_definition_version_id, is_active, expires_at, allowed_embed_origins, metadata, token_prefix, rate_limit_profile, created_at, updated_at, last_used_at";

export type FormPublicLinkSafeRow = {
    id: string;
    form_definition_id: string;
    pinned_form_definition_version_id: string | null;
    is_active: boolean;
    expires_at: string | null;
    allowed_embed_origins: string[] | null;
    metadata: Record<string, unknown>;
    token_prefix: string | null;
    rate_limit_profile: string | null;
    created_at: string;
    updated_at: string | null;
    last_used_at: string | null;
};

export async function dbListPublicLinksForForm(supabase: SupabaseClient, orgId: string, formDefinitionId: string) {
    return supabase
        .from("form_public_links")
        .select(FORM_PUBLIC_LINK_SAFE_SELECT)
        .eq("org_id", orgId)
        .eq("form_definition_id", formDefinitionId)
        .order("created_at", { ascending: false });
}

export async function dbInsertFormPublicLink(
    supabase: SupabaseClient,
    row: {
        org_id: string;
        form_definition_id: string;
        token_hash: string;
        token_prefix: string | null;
        pinned_form_definition_version_id?: string | null;
        is_active?: boolean;
        expires_at?: string | null;
        allowed_embed_origins?: string[] | null;
        metadata?: Record<string, unknown>;
    }
) {
    return supabase
        .from("form_public_links")
        .insert({
            org_id: row.org_id,
            form_definition_id: row.form_definition_id,
            token_hash: row.token_hash,
            token_prefix: row.token_prefix,
            pinned_form_definition_version_id: row.pinned_form_definition_version_id ?? null,
            is_active: row.is_active ?? true,
            expires_at: row.expires_at ?? null,
            allowed_embed_origins: row.allowed_embed_origins ?? null,
            metadata: row.metadata ?? {},
        })
        .select(FORM_PUBLIC_LINK_SAFE_SELECT)
        .single();
}

export async function dbGetPublicLinkForForm(
    supabase: SupabaseClient,
    orgId: string,
    formDefinitionId: string,
    linkId: string
) {
    return supabase
        .from("form_public_links")
        .select(FORM_PUBLIC_LINK_SAFE_SELECT)
        .eq("org_id", orgId)
        .eq("form_definition_id", formDefinitionId)
        .eq("id", linkId)
        .maybeSingle();
}

export async function dbUpdateFormPublicLinkForForm(
    supabase: SupabaseClient,
    orgId: string,
    formDefinitionId: string,
    linkId: string,
    patch: {
        is_active?: boolean;
        expires_at?: string | null;
        allowed_embed_origins?: string[] | null;
        metadata?: Record<string, unknown>;
        pinned_form_definition_version_id?: string | null;
    }
) {
    return supabase
        .from("form_public_links")
        .update(patch)
        .eq("org_id", orgId)
        .eq("form_definition_id", formDefinitionId)
        .eq("id", linkId)
        .select(FORM_PUBLIC_LINK_SAFE_SELECT)
        .single();
}
