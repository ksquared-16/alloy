/**
 * Processing dev/staging cleanup planner — dependency-safe deletion of test artifacts.
 *
 * Development/staging only. Production is blocked. Dry-run by default.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const PROCESSING_DEV_CLEANUP_CONFIRM_TOKEN = "RESET-PROCESSING-TEST-DATA";

export type ProcessingDevCleanupCounts = {
    documents: number;
    processingCases: number;
    processingCaseSources: number;
    forms: number;
    formVersions: number;
    formPublicLinks: number;
    formSubmissions: number;
    formPacketItems: number;
    publicLinks: number;
};

export type ProcessingDevCleanupPlan = {
    orgId: string;
    dryRun: boolean;
    clearAllForms: boolean;
    counts: ProcessingDevCleanupCounts;
    documentIds: string[];
    processingCaseIds: string[];
    formIds: string[];
    formSubmissionIds: string[];
    publicLinkIds: string[];
    formPacketItemIds: string[];
};

export type ProcessingDevCleanupRemaining = ProcessingDevCleanupCounts;

function isProductionLike(): boolean {
    return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function metadataSource(meta: unknown): string | null {
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
    const source = (meta as Record<string, unknown>).source;
    return typeof source === "string" ? source : null;
}

function isProcessingOwnedForm(meta: Record<string, unknown> | null | undefined): boolean {
    if (!meta) return false;
    const source = metadataSource(meta);
    return (
        source === "processing" ||
        source === "document_form_draft" ||
        meta.generated_from_processing === true ||
        typeof meta.processing_case_id === "string" ||
        meta.origin === "document" ||
        meta.origin === "blank"
    );
}

type DocumentRow = { id: string; bucket: string | null; storage_path: string | null };
type CaseRow = { id: string; metadata: Record<string, unknown> | null };
type FormRow = { id: string; metadata: Record<string, unknown> | null };

/** Build a dependency-safe cleanup plan for one org. */
export async function planProcessingDevCleanup(
    supabase: SupabaseClient,
    orgId: string,
    options?: { clearAllForms?: boolean }
): Promise<ProcessingDevCleanupPlan> {
    const clearAllForms = options?.clearAllForms === true;
    if (isProductionLike()) throw new Error("Refusing Processing dev cleanup in production.");

    const { data: caseRows, error: caseErr } = await supabase
        .from("processing_cases")
        .select("id, metadata")
        .eq("org_id", orgId);
    if (caseErr) throw new Error(caseErr.message);
    const processingCaseIds = ((caseRows ?? []) as CaseRow[]).map((row) => row.id);

    const { data: sourceRows, error: sourceErr } = processingCaseIds.length
        ? await supabase
              .from("processing_case_sources")
              .select("processing_case_id, source_id, source_kind")
              .eq("org_id", orgId)
              .in("processing_case_id", processingCaseIds)
        : { data: [], error: null };
    if (sourceErr) throw new Error(sourceErr.message);

    const documentIdsFromCases = [
        ...new Set(
            ((sourceRows ?? []) as Array<{ source_kind: string; source_id: string }>)
                .filter((row) => row.source_kind === "document")
                .map((row) => row.source_id)
        ),
    ];

    const { data: docRows, error: docErr } = await supabase
        .from("documents")
        .select("id, bucket, storage_path")
        .eq("org_id", orgId);
    if (docErr) throw new Error(docErr.message);
    const allDocumentIds = ((docRows ?? []) as DocumentRow[]).map((row) => row.id);
    const documentIds = [...new Set([...allDocumentIds, ...documentIdsFromCases])];

    const { data: formRows, error: formErr } = await supabase
        .from("form_definitions")
        .select("id, metadata")
        .eq("org_id", orgId);
    if (formErr) throw new Error(formErr.message);

    const formIdsFromCases = new Set<string>();
    for (const row of (caseRows ?? []) as CaseRow[]) {
        const created = row.metadata?.form_draft_created;
        if (created && typeof created === "object" && !Array.isArray(created)) {
            const formId = (created as Record<string, unknown>).form_id;
            if (typeof formId === "string") formIdsFromCases.add(formId);
        }
    }

    const formIds = clearAllForms
        ? [...new Set(((formRows ?? []) as FormRow[]).map((form) => form.id))]
        : [
              ...new Set(
                  ((formRows ?? []) as FormRow[])
                      .filter((form) => isProcessingOwnedForm(form.metadata) || formIdsFromCases.has(form.id))
                      .map((form) => form.id)
              ),
          ];

    const { data: versionRows, error: versionErr } = formIds.length
        ? await supabase
              .from("form_definition_versions")
              .select("id, form_definition_id")
              .eq("org_id", orgId)
              .in("form_definition_id", formIds)
        : { data: [], error: null };
    if (versionErr) throw new Error(versionErr.message);

    const { data: linkRows, error: linkErr } = formIds.length
        ? await supabase.from("form_public_links").select("id, form_definition_id").eq("org_id", orgId).in("form_definition_id", formIds)
        : { data: [], error: null };
    if (linkErr) throw new Error(linkErr.message);
    const publicLinkIds = [...new Set(((linkRows ?? []) as Array<{ id: string }>).map((row) => row.id))];

    const { data: submissionRows, error: submissionErr } = formIds.length
        ? await supabase.from("form_submissions").select("id, form_definition_id").eq("org_id", orgId).in("form_definition_id", formIds)
        : { data: [], error: null };
    if (submissionErr) throw new Error(submissionErr.message);
    const formSubmissionIds = [...new Set(((submissionRows ?? []) as Array<{ id: string }>).map((row) => row.id))];

    const { data: packetItemRows, error: packetItemErr } = formIds.length
        ? await supabase
              .from("form_packet_items")
              .select("id, form_definition_id")
              .eq("org_id", orgId)
              .in("form_definition_id", formIds)
        : { data: [], error: null };
    if (packetItemErr) throw new Error(packetItemErr.message);
    const formPacketItemIds = [...new Set(((packetItemRows ?? []) as Array<{ id: string }>).map((row) => row.id))];

    return {
        orgId,
        dryRun: true,
        clearAllForms,
        counts: {
            documents: documentIds.length,
            processingCases: processingCaseIds.length,
            processingCaseSources: (sourceRows ?? []).length,
            forms: formIds.length,
            formVersions: (versionRows ?? []).length,
            formPublicLinks: publicLinkIds.length,
            formSubmissions: formSubmissionIds.length,
            formPacketItems: formPacketItemIds.length,
            publicLinks: publicLinkIds.length,
        },
        documentIds,
        processingCaseIds,
        formIds,
        formSubmissionIds,
        publicLinkIds,
        formPacketItemIds,
    };
}

async function assertDelete(label: string, result: { error: { message: string } | null }): Promise<void> {
    if (result.error) throw new Error(`${label}: ${result.error.message}`);
}

/** Apply the cleanup plan — deletes eligible Processing test artifacts only. */
export async function applyProcessingDevCleanup(
    supabase: SupabaseClient,
    orgId: string,
    options?: { clearAllForms?: boolean }
): Promise<ProcessingDevCleanupPlan & { remaining: ProcessingDevCleanupRemaining }> {
    if (isProductionLike()) throw new Error("Refusing Processing dev cleanup in production.");

    const plan = await planProcessingDevCleanup(supabase, orgId, options);

    if (plan.formSubmissionIds.length > 0) {
        await assertDelete(
            "form_packet_session_items by submission",
            await supabase.from("form_packet_session_items").delete().eq("org_id", orgId).in("form_submission_id", plan.formSubmissionIds)
        );
        await assertDelete(
            "form_submission_signatures",
            await supabase.from("form_submission_signatures").delete().eq("org_id", orgId).in("form_submission_id", plan.formSubmissionIds)
        );
        await assertDelete(
            "form_submission_documents",
            await supabase.from("form_submission_documents").delete().eq("org_id", orgId).in("form_submission_id", plan.formSubmissionIds)
        );
        await assertDelete(
            "form_submissions",
            await supabase.from("form_submissions").delete().eq("org_id", orgId).in("id", plan.formSubmissionIds)
        );
    }
    if (plan.publicLinkIds.length > 0) {
        await assertDelete(
            "form_public_links",
            await supabase.from("form_public_links").delete().eq("org_id", orgId).in("id", plan.publicLinkIds)
        );
    }
    if (plan.formPacketItemIds.length > 0) {
        await assertDelete(
            "form_packet_session_items by packet item",
            await supabase.from("form_packet_session_items").delete().eq("org_id", orgId).in("packet_item_id", plan.formPacketItemIds)
        );
        await assertDelete(
            "form_packet_items",
            await supabase.from("form_packet_items").delete().eq("org_id", orgId).in("id", plan.formPacketItemIds)
        );
    }
    if (plan.formIds.length > 0) {
        await assertDelete(
            "form_definition_versions",
            await supabase.from("form_definition_versions").delete().eq("org_id", orgId).in("form_definition_id", plan.formIds)
        );
        await assertDelete(
            "form_definitions",
            await supabase.from("form_definitions").delete().eq("org_id", orgId).in("id", plan.formIds)
        );
    }
    if (plan.processingCaseIds.length > 0) {
        await assertDelete(
            "processing_case_sources",
            await supabase.from("processing_case_sources").delete().eq("org_id", orgId).in("processing_case_id", plan.processingCaseIds)
        );
        await assertDelete(
            "processing_cases",
            await supabase.from("processing_cases").delete().eq("org_id", orgId).in("id", plan.processingCaseIds)
        );
    }

    if (plan.documentIds.length > 0) {
        const { data: docs } = await supabase
            .from("documents")
            .select("id, bucket, storage_path")
            .eq("org_id", orgId)
            .in("id", plan.documentIds);
        for (const doc of (docs ?? []) as DocumentRow[]) {
            if (doc.bucket && doc.storage_path) {
                const { error } = await supabase.storage.from(doc.bucket).remove([doc.storage_path]);
                if (error) console.warn("[processing-dev-cleanup] storage remove failed", doc.storage_path, error.message);
            }
        }
        await supabase.from("documents").delete().eq("org_id", orgId).in("id", plan.documentIds);
    }

    const remaining = await countRemainingProcessingArtifacts(supabase, orgId);
    return { ...plan, dryRun: false, remaining };
}

/** Post-apply verification — actual row counts by artifact type. */
export async function countRemainingProcessingArtifacts(
    supabase: SupabaseClient,
    orgId: string
): Promise<ProcessingDevCleanupRemaining> {
    const [{ count: documents }, { count: processingCases }, { count: forms }, { count: formSubmissions }, { count: formPublicLinks }, { count: formPacketItems }] =
        await Promise.all([
            supabase.from("documents").select("id", { count: "exact", head: true }).eq("org_id", orgId),
            supabase.from("processing_cases").select("id", { count: "exact", head: true }).eq("org_id", orgId),
            supabase.from("form_definitions").select("id", { count: "exact", head: true }).eq("org_id", orgId),
            supabase.from("form_submissions").select("id", { count: "exact", head: true }).eq("org_id", orgId),
            supabase.from("form_public_links").select("id", { count: "exact", head: true }).eq("org_id", orgId),
            supabase.from("form_packet_items").select("id", { count: "exact", head: true }).eq("org_id", orgId),
        ]);

    const { count: processingCaseSources } = await supabase
        .from("processing_case_sources")
        .select("processing_case_id", { count: "exact", head: true })
        .eq("org_id", orgId);

    const { count: formVersions } = await supabase
        .from("form_definition_versions")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId);

    return {
        documents: documents ?? 0,
        processingCases: processingCases ?? 0,
        processingCaseSources: processingCaseSources ?? 0,
        forms: forms ?? 0,
        formVersions: formVersions ?? 0,
        formPublicLinks: formPublicLinks ?? 0,
        formSubmissions: formSubmissions ?? 0,
        formPacketItems: formPacketItems ?? 0,
        publicLinks: formPublicLinks ?? 0,
    };
}

export function assertProcessingDevCleanupAllowed(): void {
    if (isProductionLike()) throw new Error("Processing dev cleanup is disabled in production.");
}
