#!/usr/bin/env npx tsx
/**
 * DEV-ONLY cleanup for Processing Form Composer E2E artifacts.
 *
 * Removes duplicate MO500/E2E source documents, their processing cases, and generated
 * document-origin forms for one org. Dry-run by default.
 *
 * Run from `web/`:
 *   ORG_ID=<uuid> npm run dev:clean:processing-composer-e2e
 *   ORG_ID=<uuid> PROCESSING_COMPOSER_E2E_CLEANUP_APPLY=1 npm run dev:clean:processing-composer-e2e
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { createAdminClient } from "@/lib/supabaseAdmin";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const APPLY_FLAG = "PROCESSING_COMPOSER_E2E_CLEANUP_APPLY";

type DocumentRow = {
    id: string;
    title: string | null;
    original_filename: string | null;
    bucket: string | null;
    storage_path: string | null;
};

type CaseRow = {
    id: string;
    metadata: Record<string, unknown> | null;
};

function isProductionLike(): boolean {
    return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function isComposerE2eName(value: string | null | undefined): boolean {
    const text = (value ?? "").toLowerCase();
    return text.includes("mo500") || text.includes("e2e-composer") || text.includes("processing-form-composer");
}

function metadataSource(meta: unknown): string | null {
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
    const source = (meta as Record<string, unknown>).source;
    return typeof source === "string" ? source : null;
}

async function main() {
    const orgId = (process.env.ORG_ID ?? process.env.DEV_QUEUE_ORG_ID ?? "").trim();
    if (!orgId) throw new Error("ORG_ID or DEV_QUEUE_ORG_ID is required.");
    if (isProductionLike()) throw new Error("Refusing to run Processing Composer E2E cleanup in production.");

    const apply = process.env[APPLY_FLAG] === "1";
    const supabase = createAdminClient();

    const { data: docRows, error: docErr } = await supabase
        .from("documents")
        .select("id, title, original_filename, bucket, storage_path")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(1000);
    if (docErr) throw new Error(docErr.message);

    const docs = ((docRows ?? []) as DocumentRow[]).filter(
        (doc) => isComposerE2eName(doc.title) || isComposerE2eName(doc.original_filename) || isComposerE2eName(doc.storage_path)
    );
    const docIds = docs.map((doc) => doc.id);

    const caseIdsFromDocs = new Set<string>();
    if (docIds.length > 0) {
        const { data: sourceRows, error: sourceErr } = await supabase
            .from("processing_case_sources")
            .select("processing_case_id")
            .eq("org_id", orgId)
            .eq("source_kind", "document")
            .in("source_id", docIds);
        if (sourceErr) throw new Error(sourceErr.message);
        for (const row of (sourceRows ?? []) as Array<{ processing_case_id: string }>) caseIdsFromDocs.add(row.processing_case_id);
    }

    const { data: formRows, error: formErr } = await supabase
        .from("form_definitions")
        .select("id, name, key, metadata")
        .eq("org_id", orgId)
        .limit(1000);
    if (formErr) throw new Error(formErr.message);

    const formIds = ((formRows ?? []) as Array<{ id: string; name: string | null; key: string | null; metadata: Record<string, unknown> | null }>)
        .filter((form) => {
            const source = metadataSource(form.metadata);
            const sourceDocId = typeof form.metadata?.source_document_id === "string" ? form.metadata.source_document_id : null;
            return (
                source === "document_form_draft" &&
                (docIds.includes(sourceDocId ?? "") || isComposerE2eName(form.name) || isComposerE2eName(form.key))
            );
        })
        .map((form) => form.id);

    const { data: caseRows, error: caseErr } = caseIdsFromDocs.size
        ? await supabase.from("processing_cases").select("id, metadata").eq("org_id", orgId).in("id", [...caseIdsFromDocs])
        : { data: [], error: null };
    if (caseErr) throw new Error(caseErr.message);

    for (const row of (caseRows ?? []) as CaseRow[]) {
        const created = row.metadata?.form_draft_created;
        if (created && typeof created === "object" && !Array.isArray(created)) {
            const formId = (created as Record<string, unknown>).form_id;
            if (typeof formId === "string") formIds.push(formId);
        }
    }

    const uniqueFormIds = [...new Set(formIds)];
    const uniqueCaseIds = [...caseIdsFromDocs];

    const plan = {
        orgId,
        dryRun: !apply,
        documents: docIds.length,
        processingCases: uniqueCaseIds.length,
        forms: uniqueFormIds.length,
        hint: apply ? "Deleted dev/test artifacts." : `Dry run only. Set ${APPLY_FLAG}=1 to delete.`,
    };

    if (!apply) {
        console.log(JSON.stringify(plan, null, 2));
        return;
    }

    if (uniqueFormIds.length > 0) {
        await supabase.from("form_public_links").delete().eq("org_id", orgId).in("form_definition_id", uniqueFormIds);
        await supabase.from("form_definition_versions").delete().eq("org_id", orgId).in("form_definition_id", uniqueFormIds);
        await supabase.from("form_definitions").delete().eq("org_id", orgId).in("id", uniqueFormIds);
    }
    if (uniqueCaseIds.length > 0) {
        await supabase.from("processing_case_sources").delete().eq("org_id", orgId).in("processing_case_id", uniqueCaseIds);
        await supabase.from("processing_cases").delete().eq("org_id", orgId).in("id", uniqueCaseIds);
    }
    for (const doc of docs) {
        if (doc.bucket && doc.storage_path) {
            const { error } = await supabase.storage.from(doc.bucket).remove([doc.storage_path]);
            if (error) console.warn("[processing-composer-cleanup] storage remove failed", doc.storage_path, error.message);
        }
    }
    if (docIds.length > 0) {
        await supabase.from("documents").delete().eq("org_id", orgId).in("id", docIds);
    }

    console.log(JSON.stringify(plan, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
