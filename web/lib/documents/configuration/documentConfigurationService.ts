/**
 * D3 — Document Studio configuration: the server-side operations behind `/api/admin/documents/configuration/*`.
 *
 * Every write goes through the service-role client into tables the database guards (migration 20261209090100):
 * stable keys, organization-bound parents, no cycles, archive/delete only when safe, immutable published versions,
 * publication only through `document_type_publish` (compare-and-swap) and validation only through
 * `document_type_validate`. This module maps the database's typed refusals to stable codes; it never re-implements a
 * guard the database already holds.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { documentTypeDraftProblems, type DocumentTypeDraft, type PolicyProblem } from "@/lib/documents/configuration/documentTypePolicy";
import type { DeclaredDocumentSensitivity } from "@/lib/documents/documentSensitivity";

export type ConfigError = { ok: false; code: string; status: number; message: string; problems?: PolicyProblem[] };
export type ConfigResult<T> = { ok: true; value: T } | ConfigError;

/** The database's refusal prefixes → a code and an HTTP status. */
const REFUSALS: Array<[RegExp, string, number]> = [
    [/document_category_cycle/, "CATEGORY_CYCLE", 409],
    [/document_category_depth/, "CATEGORY_TOO_DEEP", 409],
    [/document_category_parent_org/, "PARENT_NOT_FOUND", 404],
    [/document_category_parent_archived/, "PARENT_ARCHIVED", 409],
    [/document_category_has_active_children/, "CATEGORY_HAS_ACTIVE_CHILDREN", 409],
    [/document_category_has_children/, "CATEGORY_HAS_CHILDREN", 409],
    [/document_category_in_use/, "CATEGORY_IN_USE", 409],
    [/document_category_identity|document_type_identity|document_type_version_identity/, "IDENTITY_IMMUTABLE", 409],
    [/document_type_in_use/, "TYPE_IN_USE", 409],
    [/document_type_archived/, "TYPE_ARCHIVED", 409],
    [/document_type_publish_conflict/, "PUBLISH_CONFLICT", 409],
    [/document_type_version_not_validated/, "NOT_VALIDATED", 409],
    [/document_type_version_not_open/, "VERSION_NOT_OPEN", 409],
    [/document_type_version_invalid/, "INVALID", 400],
    [/document_type_version_immutable/, "VERSION_IMMUTABLE", 409],
    [/document_type_category_org/, "CATEGORY_NOT_FOUND", 404],
    [/document_type_not_found|document_type_version_not_found/, "NOT_FOUND", 404],
    [/uq_document_categories_key|uq_document_types_key/, "KEY_TAKEN", 409],
    [/chk_document_categories_key|chk_document_types_key/, "KEY_INVALID", 400],
    [/chk_document_categories_label/, "LABEL_REQUIRED", 400],
];

function refusal(error: { message?: string } | null | undefined): ConfigError {
    const message = error?.message ?? "unknown error";
    for (const [re, code, status] of REFUSALS) if (re.test(message)) return { ok: false, code, status, message };
    return { ok: false, code: "CONFIGURATION_WRITE_FAILED", status: 500, message };
}

// ── categories ──────────────────────────────────────────────────────────────────────────────────────────────────
export type DocumentCategory = {
    id: string;
    key: string;
    label: string;
    description: string | null;
    parent_id: string | null;
    sort_order: number;
    status: "active" | "archived";
    seeded: boolean;
    updated_at: string;
};
const CATEGORY_COLUMNS = "id, key, label, description, parent_id, sort_order, status, seeded, updated_at";

export async function listCategories(supabase: SupabaseClient, orgId: string): Promise<ConfigResult<DocumentCategory[]>> {
    const { data, error } = await supabase.from("document_categories").select(CATEGORY_COLUMNS).eq("org_id", orgId).order("sort_order").order("label");
    if (error) return refusal(error);
    return { ok: true, value: (data ?? []) as DocumentCategory[] };
}

export async function createCategory(
    supabase: SupabaseClient,
    input: { id: string; orgId: string; key: string; label: string; description: string | null; parentId: string | null; sortOrder: number; actorUserId: string },
): Promise<ConfigResult<DocumentCategory>> {
    const { data, error } = await supabase
        .from("document_categories")
        .insert({
            id: input.id,
            org_id: input.orgId,
            key: input.key,
            label: input.label,
            description: input.description,
            parent_id: input.parentId,
            sort_order: input.sortOrder,
            created_by: input.actorUserId,
            updated_by: input.actorUserId,
        })
        .select(CATEGORY_COLUMNS)
        .single();
    if (error) return refusal(error);
    return { ok: true, value: data as DocumentCategory };
}

export async function updateCategory(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        id: string;
        patch: Partial<{ label: string; description: string | null; parent_id: string | null; sort_order: number; status: "active" | "archived" }>;
        actorUserId: string;
    },
): Promise<ConfigResult<DocumentCategory>> {
    const patch: Record<string, unknown> = { ...input.patch, updated_by: input.actorUserId };
    if (input.patch.status === "archived") patch.archived_by = input.actorUserId;
    const { data, error } = await supabase
        .from("document_categories")
        .update(patch)
        .eq("org_id", input.orgId)
        .eq("id", input.id)
        .select(CATEGORY_COLUMNS)
        .maybeSingle();
    if (error) return refusal(error);
    if (!data) return { ok: false, code: "NOT_FOUND", status: 404, message: "category not found" };
    return { ok: true, value: data as DocumentCategory };
}

export async function deleteCategory(supabase: SupabaseClient, orgId: string, id: string): Promise<ConfigResult<{ id: string }>> {
    const { data, error } = await supabase.from("document_categories").delete().eq("org_id", orgId).eq("id", id).select("id");
    if (error) return refusal(error);
    if (!data || data.length === 0) return { ok: false, code: "NOT_FOUND", status: 404, message: "category not found" };
    return { ok: true, value: { id } };
}

export async function categoryIsActiveInOrg(supabase: SupabaseClient, orgId: string, id: string | null): Promise<boolean> {
    if (!id) return false;
    const { data } = await supabase.from("document_categories").select("id").eq("org_id", orgId).eq("id", id).eq("status", "active").maybeSingle();
    return Boolean(data);
}

// ── types ───────────────────────────────────────────────────────────────────────────────────────────────────────
export type DocumentTypeVersion = DocumentTypeDraft & {
    id: string;
    version_number: number;
    status: "draft" | "validated" | "published" | "superseded";
    validation_errors: PolicyProblem[];
    created_at: string;
    published_at: string | null;
};
export type DocumentTypeSummary = {
    id: string;
    key: string;
    status: "active" | "archived";
    seeded: boolean;
    published_version_id: string | null;
    published: DocumentTypeVersion | null;
    open_draft: DocumentTypeVersion | null;
};
const VERSION_COLUMNS =
    "id, document_type_id, version_number, status, label, description, category_id, subject_types, allowed_formats, default_sensitivity, review_required, replacement_policy, validity_policy, validation_errors, created_at, published_at";

export async function listTypes(supabase: SupabaseClient, orgId: string): Promise<ConfigResult<DocumentTypeSummary[]>> {
    const [{ data: types, error: tErr }, { data: versions, error: vErr }] = await Promise.all([
        supabase.from("document_types").select("id, key, status, seeded, published_version_id").eq("org_id", orgId).order("key"),
        supabase.from("document_type_versions").select(VERSION_COLUMNS).eq("org_id", orgId).in("status", ["published", "draft", "validated"]),
    ]);
    if (tErr || vErr) return refusal(tErr ?? vErr);
    const byType = new Map<string, Array<DocumentTypeVersion & { document_type_id: string }>>();
    for (const v of (versions ?? []) as Array<DocumentTypeVersion & { document_type_id: string }>) {
        const list = byType.get(v.document_type_id) ?? [];
        list.push(v);
        byType.set(v.document_type_id, list);
    }
    const value = ((types ?? []) as Array<Omit<DocumentTypeSummary, "published" | "open_draft">>).map((t) => {
        const vs = byType.get(t.id) ?? [];
        return {
            ...t,
            published: vs.find((v) => v.status === "published") ?? null,
            open_draft: vs.find((v) => v.status === "draft" || v.status === "validated") ?? null,
        };
    });
    return { ok: true, value };
}

export async function getType(
    supabase: SupabaseClient,
    orgId: string,
    typeId: string,
): Promise<ConfigResult<{ type: Omit<DocumentTypeSummary, "published" | "open_draft">; versions: DocumentTypeVersion[] }>> {
    const { data: type, error } = await supabase
        .from("document_types")
        .select("id, key, status, seeded, published_version_id")
        .eq("org_id", orgId)
        .eq("id", typeId)
        .maybeSingle();
    if (error) return refusal(error);
    if (!type) return { ok: false, code: "NOT_FOUND", status: 404, message: "type not found" };
    const { data: versions, error: vErr } = await supabase
        .from("document_type_versions")
        .select(VERSION_COLUMNS)
        .eq("org_id", orgId)
        .eq("document_type_id", typeId)
        .order("version_number", { ascending: false });
    if (vErr) return refusal(vErr);
    return { ok: true, value: { type: type as DocumentTypeSummary, versions: (versions ?? []) as DocumentTypeVersion[] } };
}

function draftColumns(draft: DocumentTypeDraft) {
    return {
        label: draft.label,
        description: draft.description ?? null,
        category_id: draft.category_id,
        subject_types: draft.subject_types,
        allowed_formats: draft.allowed_formats,
        default_sensitivity: draft.default_sensitivity,
        review_required: draft.review_required,
        replacement_policy: draft.replacement_policy,
        validity_policy: draft.validity_policy,
    };
}

export async function createType(
    supabase: SupabaseClient,
    input: { typeId: string; orgId: string; key: string; draft: DocumentTypeDraft; actorUserId: string },
): Promise<ConfigResult<{ type_id: string; version_id: string }>> {
    const { data: type, error } = await supabase
        .from("document_types")
        .insert({ id: input.typeId, org_id: input.orgId, key: input.key, created_by: input.actorUserId, updated_by: input.actorUserId })
        .select("id")
        .single();
    if (error) return refusal(error);
    const typeId = (type as { id: string }).id;
    const { data: version, error: vErr } = await supabase
        .from("document_type_versions")
        .insert({ org_id: input.orgId, document_type_id: typeId, version_number: 1, ...draftColumns(input.draft), created_by: input.actorUserId, updated_by: input.actorUserId })
        .select("id")
        .single();
    if (vErr) {
        // The identity row has no version yet and nothing references it; remove it so a failed create leaves nothing behind.
        await supabase.from("document_types").delete().eq("org_id", input.orgId).eq("id", typeId);
        return refusal(vErr);
    }
    return { ok: true, value: { type_id: typeId, version_id: (version as { id: string }).id } };
}

/** Save the type's open draft, or open a new revision (version n+1) when only published versions exist. */
export async function saveDraft(
    supabase: SupabaseClient,
    input: { orgId: string; typeId: string; draft: DocumentTypeDraft; actorUserId: string },
): Promise<ConfigResult<{ version_id: string; version_number: number; created: boolean }>> {
    const got = await getType(supabase, input.orgId, input.typeId);
    if (!got.ok) return got;
    const open = got.value.versions.find((v) => v.status === "draft" || v.status === "validated");
    if (open) {
        const { data, error } = await supabase
            .from("document_type_versions")
            .update({ ...draftColumns(input.draft), updated_by: input.actorUserId, validation_errors: [] })
            .eq("org_id", input.orgId)
            .eq("id", open.id)
            .select("id, version_number")
            .maybeSingle();
        if (error) return refusal(error);
        if (!data) return { ok: false, code: "NOT_FOUND", status: 404, message: "draft not found" };
        return { ok: true, value: { version_id: open.id, version_number: open.version_number, created: false } };
    }
    const next = Math.max(0, ...got.value.versions.map((v) => v.version_number)) + 1;
    const { data, error } = await supabase
        .from("document_type_versions")
        .insert({ org_id: input.orgId, document_type_id: input.typeId, version_number: next, ...draftColumns(input.draft), created_by: input.actorUserId, updated_by: input.actorUserId })
        .select("id")
        .single();
    if (error) return refusal(error);
    return { ok: true, value: { version_id: (data as { id: string }).id, version_number: next, created: true } };
}

/**
 * Discard the type's open (draft or validated) version. Only an unpublished version is ever removed: the delete is
 * filtered to open statuses and the database refuses a published or superseded one. A type whose open draft is its
 * only version is deleted as a type, not left with no versions.
 */
export async function discardDraft(
    supabase: SupabaseClient,
    input: { orgId: string; typeId: string },
): Promise<ConfigResult<{ version_id: string; version_number: number }>> {
    const got = await getType(supabase, input.orgId, input.typeId);
    if (!got.ok) return got;
    const open = got.value.versions.find((v) => v.status === "draft" || v.status === "validated");
    if (!open) return { ok: false, code: "NO_OPEN_DRAFT", status: 404, message: "the type has no unpublished draft" };
    if (got.value.versions.length === 1) {
        return { ok: false, code: "ONLY_VERSION", status: 409, message: "the draft is the type's only version; delete the type instead" };
    }
    const { data, error } = await supabase
        .from("document_type_versions")
        .delete()
        .eq("org_id", input.orgId)
        .eq("id", open.id)
        .in("status", ["draft", "validated"])
        .select("id");
    if (error) return refusal(error);
    if (!data || data.length === 0) return { ok: false, code: "NO_OPEN_DRAFT", status: 404, message: "the draft is no longer open" };
    return { ok: true, value: { version_id: open.id, version_number: open.version_number } };
}

export async function validateVersion(
    supabase: SupabaseClient,
    input: { orgId: string; versionId: string; actorUserId: string },
): Promise<ConfigResult<{ valid: boolean; problems: PolicyProblem[] }>> {
    const { data, error } = await supabase.rpc("document_type_validate", { p_org_id: input.orgId, p_version_id: input.versionId, p_actor: input.actorUserId });
    if (error) return refusal(error);
    const r = (data ?? {}) as { valid?: boolean; problems?: PolicyProblem[] };
    return { ok: true, value: { valid: r.valid === true, problems: r.problems ?? [] } };
}

export async function publishVersion(
    supabase: SupabaseClient,
    input: { orgId: string; typeId: string; versionId: string; expectedPublishedVersionId: string | null; actorUserId: string },
): Promise<ConfigResult<{ version_id: string; version_number: number; superseded_version_id: string | null }>> {
    const { data, error } = await supabase.rpc("document_type_publish", {
        p_org_id: input.orgId,
        p_type_id: input.typeId,
        p_version_id: input.versionId,
        p_expected_published_version_id: input.expectedPublishedVersionId,
        p_actor: input.actorUserId,
    });
    if (error) return refusal(error);
    const r = (data ?? {}) as { version_id: string; version_number: number; superseded_version_id: string | null };
    return { ok: true, value: r };
}

export async function setTypeStatus(
    supabase: SupabaseClient,
    input: { orgId: string; typeId: string; status: "active" | "archived"; actorUserId: string },
): Promise<ConfigResult<{ id: string; status: string }>> {
    const { data, error } = await supabase
        .from("document_types")
        .update({ status: input.status, updated_by: input.actorUserId, ...(input.status === "archived" ? { archived_by: input.actorUserId } : {}) })
        .eq("org_id", input.orgId)
        .eq("id", input.typeId)
        .select("id, status")
        .maybeSingle();
    if (error) return refusal(error);
    if (!data) return { ok: false, code: "NOT_FOUND", status: 404, message: "type not found" };
    return { ok: true, value: data as { id: string; status: string } };
}

export async function deleteType(supabase: SupabaseClient, orgId: string, typeId: string): Promise<ConfigResult<{ id: string }>> {
    const { data, error } = await supabase.from("document_types").delete().eq("org_id", orgId).eq("id", typeId).select("id");
    if (error) return refusal(error);
    if (!data || data.length === 0) return { ok: false, code: "NOT_FOUND", status: 404, message: "type not found" };
    return { ok: true, value: { id: typeId } };
}

/** The problems the editor shows before validation, with the server-only context filled in. */
export async function previewProblems(
    supabase: SupabaseClient,
    input: { orgId: string; typeKey: string; draft: DocumentTypeDraft; publishedSensitivity: DeclaredDocumentSensitivity | null },
): Promise<PolicyProblem[]> {
    const categoryActive = await categoryIsActiveInOrg(supabase, input.orgId, input.draft.category_id);
    return documentTypeDraftProblems(input.draft, { typeKey: input.typeKey, categoryActive, publishedSensitivity: input.publishedSensitivity });
}

/** How the stored `documents.doc_type` values map onto the organization's types. Counts only. */
export async function compatibilityReport(
    supabase: SupabaseClient,
    orgId: string,
): Promise<ConfigResult<Array<{ doc_type: string | null; documents: number; type_id: string | null; type_status: string | null }>>> {
    const [{ data: docs, error: dErr }, { data: types, error: tErr }] = await Promise.all([
        supabase.from("documents").select("doc_type").eq("org_id", orgId).range(0, 9999),
        supabase.from("document_types").select("id, key, status").eq("org_id", orgId),
    ]);
    if (dErr || tErr) return refusal(dErr ?? tErr);
    const counts = new Map<string | null, number>();
    for (const d of (docs ?? []) as Array<{ doc_type: string | null }>) counts.set(d.doc_type ?? null, (counts.get(d.doc_type ?? null) ?? 0) + 1);
    const byKey = new Map(((types ?? []) as Array<{ id: string; key: string; status: string }>).map((t) => [t.key, t]));
    const value = [...counts.entries()]
        .map(([doc_type, documents]) => {
            const t = doc_type ? byKey.get(doc_type) : undefined;
            return { doc_type, documents, type_id: t?.id ?? null, type_status: t?.status ?? null };
        })
        .sort((a, b) => b.documents - a.documents);
    return { ok: true, value };
}
