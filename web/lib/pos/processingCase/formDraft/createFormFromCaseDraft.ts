/**
 * POS-FP13 — create a real, UNPUBLISHED editable form from a case's draft preview.
 *
 *   metadata.form_draft_preview → FormSchemaV1 → form_definition + draft version
 *
 * Reuses the existing Forms tables/helpers (no new form system). The version is created
 * with status "draft" — it is NEVER published, NEVER given a public link, and no parent-
 * facing activation happens. Idempotent: once created, repeat calls return the existing
 * link (no duplicate form). It writes only to forms tables + the case's metadata link;
 * no business records, no matching, no commit.
 *
 * Pure orchestration over injected deps so it is unit-testable without Supabase.
 */

import { safeParseFormSchema } from "@/lib/forms/schema";
import { allocateUniqueKey, slugKeyFromDisplayName } from "@/lib/forms/adminGeneratedKeys";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    dbInsertFormDefinition,
    dbInsertVersion,
    dbListFormDefinitionKeys,
    dbMaxVersionNumber,
} from "@/lib/admin/forms/formsAdminDb";
import { parseStoredFormDraftPreview } from "./formDraftPreviewDb";
import { draftFormToFormSchemaV1 } from "./draftFormToFormSchemaV1";

export interface FormDraftCreatedLink {
    form_id: string;
    form_version_id: string;
    created_at: string;
}

export interface CreateFormDeps {
    loadCaseMetadata(args: { orgId: string; caseId: string }): Promise<Record<string, unknown> | null>;
    listFormKeys(orgId: string): Promise<Set<string>>;
    insertFormDefinition(args: { orgId: string; key: string; name: string; metadata: Record<string, unknown> }): Promise<{ id: string }>;
    maxVersionNumber(formId: string): Promise<number>;
    insertVersion(args: {
        orgId: string;
        formDefinitionId: string;
        versionNumber: number;
        schemaJson: unknown;
        metadata: Record<string, unknown>;
    }): Promise<{ id: string }>;
    updateCaseMetadata(args: { orgId: string; caseId: string; metadata: Record<string, unknown> }): Promise<void>;
    now(): Date;
}

export type CreateFormResult =
    | { ok: true; formId: string; formVersionId: string; createdAt: string; alreadyCreated: boolean }
    | { ok: false; code: "not_found" | "no_preview" | "invalid_schema"; message: string };

/** Read an already-stored creation link from case metadata (idempotency + read model). */
export function parseFormDraftCreated(metadata: unknown): FormDraftCreatedLink | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const raw = (metadata as Record<string, unknown>).form_draft_created;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const c = raw as Record<string, unknown>;
    if (typeof c.form_id !== "string" || typeof c.form_version_id !== "string") return null;
    return {
        form_id: c.form_id,
        form_version_id: c.form_version_id,
        created_at: typeof c.created_at === "string" ? c.created_at : "",
    };
}

export async function createFormFromCaseDraft(
    deps: CreateFormDeps,
    args: { orgId: string; caseId: string }
): Promise<CreateFormResult> {
    const metadata = await deps.loadCaseMetadata(args);
    if (metadata === null) return { ok: false, code: "not_found", message: "Not found" };

    // Idempotent: already created → return the existing link, never make a duplicate.
    const existing = parseFormDraftCreated(metadata);
    if (existing) {
        return { ok: true, formId: existing.form_id, formVersionId: existing.form_version_id, createdAt: existing.created_at, alreadyCreated: true };
    }

    const preview = parseStoredFormDraftPreview(metadata);
    if (!preview) {
        return { ok: false, code: "no_preview", message: "No form draft preview — run “Create form from document” first." };
    }

    const schema = draftFormToFormSchemaV1(preview);
    const parsed = safeParseFormSchema(schema);
    if (!parsed.success) {
        return { ok: false, code: "invalid_schema", message: "The generated draft did not validate as a form schema." };
    }

    const name = preview.title?.trim() || "Untitled form";
    const taken = await deps.listFormKeys(args.orgId);
    const key = allocateUniqueKey(slugKeyFromDisplayName(name), taken);

    const def = await deps.insertFormDefinition({
        orgId: args.orgId,
        key,
        name,
        metadata: {
            source: "document_form_draft",
            source_case_id: args.caseId,
            source_document_id: preview.source_document_id,
            // Surfaced in POS → Forms so document-originated forms show provenance + size.
            source_document_title: preview.title,
            field_count: preview.fields.length,
        },
    });

    const versionNumber = (await deps.maxVersionNumber(def.id)) + 1;
    const ver = await deps.insertVersion({
        orgId: args.orgId,
        formDefinitionId: def.id,
        versionNumber,
        schemaJson: parsed.data, // status is "draft" — set by the deps adapter; never published here
        metadata: { source: "document_form_draft", source_case_id: args.caseId },
    });

    const createdAt = deps.now().toISOString();
    await deps.updateCaseMetadata({
        orgId: args.orgId,
        caseId: args.caseId,
        metadata: { ...metadata, form_draft_created: { form_id: def.id, form_version_id: ver.id, created_at: createdAt } },
    });

    return { ok: true, formId: def.id, formVersionId: ver.id, createdAt, alreadyCreated: false };
}

/** Production deps backed by Supabase + the existing Forms DB helpers. Versions are ALWAYS "draft". */
export function makeCreateFormDepsFromSupabase(supabase: SupabaseClient): CreateFormDeps {
    return {
        async loadCaseMetadata({ orgId, caseId }) {
            const { data, error } = await supabase
                .from("processing_cases")
                .select("metadata")
                .eq("org_id", orgId)
                .eq("id", caseId)
                .maybeSingle();
            if (error) throw new Error(error.message);
            if (!data) return null;
            return ((data as { metadata?: Record<string, unknown> }).metadata ?? {}) as Record<string, unknown>;
        },
        listFormKeys(orgId) {
            return dbListFormDefinitionKeys(supabase, orgId);
        },
        async insertFormDefinition({ orgId, key, name, metadata }) {
            const { data, error } = await dbInsertFormDefinition(supabase, {
                org_id: orgId,
                key,
                name,
                kind: "center",
                is_active: true,
                metadata,
            });
            if (error || !data) throw new Error(error?.message ?? "Failed to create form definition");
            return { id: (data as { id: string }).id };
        },
        maxVersionNumber(formId) {
            return dbMaxVersionNumber(supabase, formId);
        },
        async insertVersion({ orgId, formDefinitionId, versionNumber, schemaJson, metadata }) {
            const { data, error } = await dbInsertVersion(supabase, {
                form_definition_id: formDefinitionId,
                org_id: orgId,
                version_number: versionNumber,
                status: "draft", // never "published"
                schema_json: schemaJson,
                metadata,
            });
            if (error || !data) throw new Error(error?.message ?? "Failed to create form version");
            return { id: (data as { id: string }).id };
        },
        async updateCaseMetadata({ orgId, caseId, metadata }) {
            const { error } = await supabase
                .from("processing_cases")
                .update({ metadata })
                .eq("org_id", orgId)
                .eq("id", caseId);
            if (error) throw new Error(error.message);
        },
        now() {
            return new Date();
        },
    };
}
