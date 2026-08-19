import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertEntityInOrg } from "@/lib/admin/assertEntityInOrg";
import type { FormPayload } from "@/lib/forms/validateSubmission";
import {
    buildFormPdfIdempotencyKey,
    extractSlotStringsFromPayload,
    parseFormPdfMappingJson,
} from "@/lib/forms/pdf/pdfMappingContract";
import { buildStubFormPdfBuffer } from "@/lib/forms/pdf/stubFormPdfGenerator";
import { classifySupabaseStorageError } from "@/lib/admin/storageDocumentErrors";

export type CreateGeneratedPdfResult =
    | { ok: true; document_id: string; reused: boolean }
    | { ok: false; error: string; code: string; httpStatus: number };

function sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180) || "file";
}

type SubmissionRow = {
    id: string;
    org_id: string;
    status: string;
    payload: Record<string, unknown>;
    form_definition_id: string;
    form_definition_version_id: string;
    person_id: string | null;
    customer_id: string | null;
    customer_member_id: string | null;
    opportunity_id: string | null;
};

/** Prefer member → opportunity → customer → person for document parent attachment. */
export function resolveFormSubmissionDocumentParent(sub: {
    person_id: string | null;
    customer_id: string | null;
    customer_member_id: string | null;
    opportunity_id: string | null;
}): { entity_type: string; entity_id: string } | null {
    if (sub.customer_member_id) {
        return { entity_type: "customer_member", entity_id: sub.customer_member_id };
    }
    if (sub.opportunity_id) {
        return { entity_type: "opportunity", entity_id: sub.opportunity_id };
    }
    if (sub.customer_id) {
        return { entity_type: "customer", entity_id: sub.customer_id };
    }
    if (sub.person_id) {
        return { entity_type: "person", entity_id: sub.person_id };
    }
    return null;
}

export async function findExistingGeneratedPdfByIdempotency(
    supabase: SupabaseClient,
    submissionId: string,
    idempotencyKey: string
): Promise<string | null> {
    const { data: junctions, error: jErr } = await supabase
        .from("form_submission_documents")
        .select("document_id")
        .eq("form_submission_id", submissionId)
        .eq("role", "generated_pdf");
    if (jErr || !junctions?.length) return null;

    const ids = junctions.map((r: { document_id: string }) => r.document_id);
    const { data: docs, error: dErr } = await supabase.from("documents").select("id, metadata").in("id", ids);
    if (dErr || !docs) return null;

    for (const d of docs as { id: string; metadata: Record<string, unknown> | null }[]) {
        const mk = d.metadata && typeof d.metadata === "object" ? (d.metadata as { idempotency_key?: unknown }).idempotency_key : null;
        if (typeof mk === "string" && mk === idempotencyKey) {
            return d.id;
        }
    }
    return null;
}

/**
 * Bounded **Forms PDF artifact** service: mapping JSON → stub PDF bytes → `documents` + `form_submission_documents`.
 */
export async function createGeneratedPdfForSubmission(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        submissionId: string;
        forceRegenerate?: boolean;
        generatedFromDocumentId?: string | null;
    }
): Promise<CreateGeneratedPdfResult> {
    const { data: subRaw, error: sErr } = await supabase
        .from("form_submissions")
        .select("*")
        .eq("org_id", input.orgId)
        .eq("id", input.submissionId)
        .maybeSingle();

    if (sErr) return { ok: false, error: sErr.message, code: "DB", httpStatus: 500 };
    if (!subRaw) return { ok: false, error: "Submission not found", code: "NOT_FOUND", httpStatus: 404 };

    const sub = subRaw as SubmissionRow;
    if (sub.status !== "submitted") {
        return { ok: false, error: "Submission must be submitted before generating a PDF", code: "NOT_SUBMITTED", httpStatus: 409 };
    }

    const { data: ver, error: vErr } = await supabase
        .from("form_definition_versions")
        .select("id, pdf_mapping_json, metadata, schema_json, form_definition_id")
        .eq("org_id", input.orgId)
        .eq("id", sub.form_definition_version_id)
        .maybeSingle();

    if (vErr) return { ok: false, error: vErr.message, code: "DB", httpStatus: 500 };
    if (!ver) return { ok: false, error: "Version not found", code: "NOT_FOUND", httpStatus: 404 };

    const mapping = parseFormPdfMappingJson((ver as { pdf_mapping_json: unknown }).pdf_mapping_json);
    if (!mapping || !Object.keys(mapping.slots).length) {
        return { ok: false, error: "pdf_mapping_json missing or invalid for this version", code: "BAD_MAPPING", httpStatus: 400 };
    }

    const templateKey = mapping.template_key?.trim() || "form_submission_stub";
    const idempotencyKey = buildFormPdfIdempotencyKey({
        formSubmissionId: sub.id,
        formDefinitionVersionId: sub.form_definition_version_id,
        templateKey,
    });

    if (!input.forceRegenerate) {
        const existingId = await findExistingGeneratedPdfByIdempotency(supabase, sub.id, idempotencyKey);
        if (existingId) {
            return { ok: true, document_id: existingId, reused: true };
        }
    }

    const parent = resolveFormSubmissionDocumentParent(sub);
    if (!parent) {
        return {
            ok: false,
            error: "Submission must be linked to customer_member, opportunity, customer, or person to attach a document",
            code: "MISSING_ENTITY",
            httpStatus: 400,
        };
    }

    const okEntity = await assertEntityInOrg(supabase, input.orgId, parent.entity_type, parent.entity_id);
    if (!okEntity) {
        return { ok: false, error: "Linked entity not found for this organization", code: "ENTITY_NOT_FOUND", httpStatus: 404 };
    }

    const payload = sub.payload as FormPayload;
    const slots = extractSlotStringsFromPayload(mapping, payload);
    const schemaTitle =
        typeof (ver as { schema_json?: { title?: unknown } }).schema_json === "object" &&
        (ver as { schema_json?: { title?: string } }).schema_json?.title
            ? String((ver as { schema_json: { title: string } }).schema_json.title)
            : "Form";

    const buf = buildStubFormPdfBuffer({ title: schemaTitle, templateKey, slots });
    const bucket = process.env.ADMIN_DOCUMENTS_BUCKET?.trim() || "org_documents";
    const objectId = randomUUID();
    const storagePath = `${input.orgId}/${parent.entity_type}/${parent.entity_id}/${objectId}-generated-${sanitizeFilename(templateKey)}.pdf`;

    const { error: upErr } = await supabase.storage.from(bucket).upload(storagePath, buf, {
        contentType: "application/pdf",
        upsert: false,
    });

    if (upErr) {
        const classified = classifySupabaseStorageError(upErr);
        return { ok: false, error: classified.message, code: classified.code, httpStatus: classified.httpStatus };
    }

    const metaBase: Record<string, unknown> = {
        idempotency_key: idempotencyKey,
        forms_engine: "stub_pdf_v1",
        engine: mapping.engine ?? "stub",
        slot_preview: slots,
    };

    const { data: docRow, error: insErr } = await supabase
        .from("documents")
        .insert({
            org_id: input.orgId,
            entity_type: parent.entity_type,
            entity_id: parent.entity_id,
            doc_type: "generated_form_pdf",
            title: `${schemaTitle} (generated)`,
            original_filename: `${sanitizeFilename(templateKey)}.pdf`,
            mime_type: "application/pdf",
            byte_size: buf.length,
            bucket,
            storage_path: storagePath,
            status: "uploaded",
            template_key: templateKey,
            generated_from_document_id: input.generatedFromDocumentId ?? null,
            metadata: metaBase,
        })
        .select("id")
        .single();

    if (insErr || !docRow) {
        console.error("[createGeneratedPdfForSubmission] documents insert", insErr);
        await supabase.storage.from(bucket).remove([storagePath]).catch(() => {});
        return { ok: false, error: insErr?.message ?? "Insert failed", code: "DB", httpStatus: 500 };
    }

    const documentId = (docRow as { id: string }).id;

    const { error: jErr } = await supabase.from("form_submission_documents").insert({
        org_id: input.orgId,
        form_submission_id: sub.id,
        document_id: documentId,
        role: "generated_pdf",
        sort_order: 0,
        metadata: {
            template_key: templateKey,
            idempotency_key: idempotencyKey,
        },
    });

    if (jErr) {
        console.error("[createGeneratedPdfForSubmission] junction insert", jErr);
        await supabase.from("documents").delete().eq("id", documentId);
        await supabase.storage.from(bucket).remove([storagePath]).catch(() => {});
        return { ok: false, error: jErr.message, code: "DB", httpStatus: 500 };
    }

    return { ok: true, document_id: documentId, reused: false };
}
