/**
 * Persist the participant's COMPLETED enrollment document — the original, filled, signed, flattened.
 *
 * ## Where this sits in the authority map
 *
 * Forms' canonical submission is the satisfaction authority and has already happened when this
 * runs; the signature EVIDENCE is already in `form_submission_signatures`. This function only
 * materializes the presentation of that fact: the exact pinned document, filled with the exact
 * submitted values, carrying the exact captured signature marks, flattened so nothing can change.
 * Delete the artifact and the enrollment is still submitted — which is why a failure here must
 * never fail the submit.
 *
 * ## Version-safety
 *
 * The fill uses the SUBMITTED payload (never the live session), the pinned version's mapping, and
 * sha-verified source bytes — so the stored copy corresponds to what was signed, not to any later
 * state. Lineage (source/populated/signed sha256) is recorded on the document row.
 *
 * ## Storage
 *
 * Reuses the generated-PDF owners end to end: the `org_documents` bucket and path convention, a
 * `documents` row (`doc_type: "generated_form_pdf"`, distinguished by `metadata.version_role:
 * "signed"` — the junction's role CHECK constraint predates version roles and is not widened
 * here), a `form_submission_documents` join with `role: "generated_pdf"`, and the existing
 * idempotency key so a retry reuses rather than duplicates.
 */

import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { assertEntityInOrg } from "@/lib/admin/assertEntityInOrg";
import { buildSignedArtifact } from "@/lib/forms/pdf/generation/fidelityEngine";
import {
    fidelityFieldValues,
    fidelitySignaturePlacements,
    parseFidelityPdfMapping,
    resolveFidelitySourceBytes,
} from "@/lib/forms/pdf/fidelityMappingContract";
import { buildFormPdfIdempotencyKey } from "@/lib/forms/pdf/pdfMappingContract";
import {
    findExistingGeneratedPdfByIdempotency,
    resolveFormSubmissionDocumentParent,
} from "@/lib/forms/pdf/createGeneratedPdfForSubmission";
import { downloadDocumentBytesSafe } from "@/lib/pos/processingCase/structure/documentBytes";
import { classifySupabaseStorageError } from "@/lib/admin/storageDocumentErrors";
import { composeGeneratedDocument } from "@/lib/forms/pdf/generation/generatedDocumentComposer";
import { validateFormSchema, type FormSchemaV1 } from "@/lib/forms/schema";
import { documentFieldApplies } from "@/lib/forms/documentFieldApplies";

export type PersistSignedArtifactResult =
    | { readonly ok: true; readonly document_id: string; readonly reused: boolean }
    | { readonly ok: true; readonly skipped: "no_document" | "no_signatures" }
    | { readonly ok: false; readonly error: string };

type SubmissionRow = {
    id: string;
    org_id: string;
    status: string;
    payload: { values?: Record<string, unknown>; signatures?: Record<string, unknown> } | null;
    form_definition_version_id: string;
    person_id: string | null;
    customer_id: string | null;
    customer_member_id: string | null;
    opportunity_id: string | null;
};

function sanitize(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180) || "file";
}

export async function persistSignedEnrollmentArtifact(
    supabase: SupabaseClient,
    input: { readonly orgId: string; readonly submissionId: string; readonly nowIso: string },
): Promise<PersistSignedArtifactResult> {
    const { data: subRaw } = await supabase
        .from("form_submissions")
        .select(
            "id, org_id, status, payload, form_definition_version_id, person_id, customer_id, customer_member_id, opportunity_id",
        )
        .eq("org_id", input.orgId)
        .eq("id", input.submissionId)
        .maybeSingle();
    const sub = subRaw as SubmissionRow | null;
    if (!sub) return { ok: false, error: "Submission not found" };
    if (sub.status !== "submitted") return { ok: false, error: "Submission is not submitted" };

    const { data: ver } = await supabase
        .from("form_definition_versions")
        .select("pdf_mapping_json, schema_json, form_definition_id")
        .eq("org_id", input.orgId)
        .eq("id", sub.form_definition_version_id)
        .maybeSingle();
    if (!ver) return { ok: false, error: "Pinned version not found" };

    const mapping = parseFidelityPdfMapping((ver as { pdf_mapping_json: unknown }).pdf_mapping_json);

    const { data: sigRows } = await supabase
        .from("form_submission_signatures")
        .select("field_id, typed_full_name, drawn_asset_document_id, signer_acknowledged_at, signer_ip_hash")
        .eq("org_id", input.orgId)
        .eq("form_submission_id", input.submissionId);
    const signatures = (sigRows ?? []) as Array<{
        field_id: string;
        typed_full_name: string | null;
        drawn_asset_document_id: string | null;
        signer_acknowledged_at: string | null;
        signer_ip_hash: string | null;
    }>;
    const byFieldId: Record<string, { typed_full_name: string | null; drawnPng?: Uint8Array | null }> = {};
    for (const row of signatures) {
        // A drawn signature renders as the drawn image. The bytes come from the evidence's own
        // document reference; an unreadable asset falls back to nothing rather than to a typed
        // stand-in — the mark on paper must be the mark that was captured.
        let drawnPng: Uint8Array | null = null;
        if (row.drawn_asset_document_id) {
            const asset = await downloadDocumentBytesSafe(supabase, {
                orgId: input.orgId,
                documentId: row.drawn_asset_document_id,
            });
            drawnPng = asset?.bytes ?? null;
        }
        byFieldId[row.field_id] = { typed_full_name: row.typed_full_name, drawnPng };
    }

    const schemaTitleOf = (): string => {
        const t = (ver as { schema_json?: { title?: unknown } }).schema_json?.title;
        return typeof t === "string" && t.trim() ? t : "Enrollment paperwork";
    };

    if (!mapping) {
        /*
         * COMPOSED. The same completed record the parent signed, stored the same way.
         *
         * Returning `no_document` here meant the three documents the school wrote — the completed
         * Admissions application, the Tuition and Handbook agreements — left no signed copy at all.
         * A parent signed them and the record existed only as a live render, reproducible only for
         * as long as nothing upstream changed. A composed document is not a replica of an original,
         * and it is still the thing they agreed to.
         */
        return await persistComposedSignedArtifact(supabase, {
            orgId: input.orgId,
            sub,
            schemaJson: (ver as { schema_json: unknown }).schema_json,
            formDefinitionId: String((ver as { form_definition_id?: string }).form_definition_id ?? ""),
            title: schemaTitleOf(),
            marks: byFieldId,
            signedAny: signatures.length > 0,
        });
    }

    const marks = fidelitySignaturePlacements(mapping, byFieldId);
    if (marks.length === 0) return { ok: true, skipped: "no_signatures" };

    const templateKey = `fidelity:${mapping.template_key ?? mapping.source_document_id}`;
    const idempotencyKey = buildFormPdfIdempotencyKey({
        formSubmissionId: sub.id,
        formDefinitionVersionId: sub.form_definition_version_id,
        templateKey,
    });
    const existing = await findExistingGeneratedPdfByIdempotency(supabase, sub.id, idempotencyKey);
    if (existing) return { ok: true, document_id: existing, reused: true };

    const parent = resolveFormSubmissionDocumentParent(sub);
    if (!parent) return { ok: false, error: "Submission has no entity to attach the artifact to" };
    const okEntity = await assertEntityInOrg(supabase, input.orgId, parent.entity_type, parent.entity_id);
    if (!okEntity) return { ok: false, error: "Linked entity not found for this organization" };

    const source = await resolveFidelitySourceBytes(supabase, input.orgId, mapping);
    if (!source.ok) return { ok: false, error: source.detail };

    /*
     * The PINNED schema, so the stored copy applies the same conditions the live render did.
     *
     * An unreadable schema means no conditions can be evaluated; every destination then applies,
     * which is the behaviour that stood before conditions existed.
     */
    let submittedSchema: FormSchemaV1 | null = null;
    try {
        submittedSchema = validateFormSchema((ver as { schema_json: unknown }).schema_json);
    } catch {
        submittedSchema = null;
    }

    // Evidence comes from any captured signature — a drawn-only signature carries no typed name.
    const firstSigner = signatures.find((s) => s.typed_full_name || s.drawn_asset_document_id) ?? signatures[0];
    const artifact = await buildSignedArtifact({
        sourcePdf: source.bytes,
        documentId: source.sourceRef,
        // The SUBMITTED values, exactly — the stored copy must correspond to what was signed.
        // The stored copy applies the SAME conditions the live render did, or a parent would sign
        // one document and the record would keep another.
        fieldValues: fidelityFieldValues(
            mapping,
            (sub.payload?.values ?? {}) as Record<string, unknown>,
            submittedSchema
                ? documentFieldApplies({
                      schema: submittedSchema,
                      values: (sub.payload?.values ?? {}) as Record<string, unknown>,
                      signatures: (sub.payload?.signatures ?? null) as Record<string, unknown> | null,
                  })
                : undefined,
        ),
        signatures: marks,
        evidence: {
            signerName: firstSigner?.typed_full_name ?? "",
            intentAcknowledged: true,
            acknowledgedAt: firstSigner?.signer_acknowledged_at ?? input.nowIso,
            signerIpHash: firstSigner?.signer_ip_hash ?? null,
        },
        now: input.nowIso,
    });
    const signed = artifact.versions.find((v) => v.role === "signed");
    if (!signed) return { ok: false, error: "Engine produced no signed version" };

    const schemaTitle = schemaTitleOf();

    const bucket = process.env.ADMIN_DOCUMENTS_BUCKET?.trim() || "org_documents";
    const storagePath = `${input.orgId}/${parent.entity_type}/${parent.entity_id}/${randomUUID()}-signed-${sanitize(
        mapping.template_key ?? mapping.source_document_id ?? "artifact",
    )}.pdf`;

    const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(storagePath, Buffer.from(signed.bytes), { contentType: "application/pdf", upsert: false });
    if (upErr) return { ok: false, error: classifySupabaseStorageError(upErr).message };

    const { data: docRow, error: insErr } = await supabase
        .from("documents")
        .insert({
            org_id: input.orgId,
            entity_type: parent.entity_type,
            entity_id: parent.entity_id,
            doc_type: "generated_form_pdf",
            title: `${schemaTitle} (signed)`,
            original_filename: `${sanitize(schemaTitle)}-signed.pdf`,
            mime_type: "application/pdf",
            byte_size: signed.byteLength,
            bucket,
            storage_path: storagePath,
            status: "uploaded",
            template_key: templateKey,
            generated_from_document_id: mapping.source_document_id ?? null,
            checksum_sha256: signed.sha256,
            metadata: {
                idempotency_key: idempotencyKey,
                forms_engine: "fidelity_v1",
                version_role: "signed",
                lineage: artifact.lineage,
                fill_report: artifact.fill_report,
                source_ref: source.sourceRef,
            },
        })
        .select("id")
        .maybeSingle();
    if (insErr || !docRow) {
        await supabase.storage.from(bucket).remove([storagePath]);
        return { ok: false, error: insErr?.message ?? "Document insert failed" };
    }

    const documentId = (docRow as { id: string }).id;
    const { error: junErr } = await supabase.from("form_submission_documents").insert({
        org_id: input.orgId,
        form_submission_id: sub.id,
        document_id: documentId,
        role: "generated_pdf",
        metadata: { template_key: templateKey, idempotency_key: idempotencyKey, version_role: "signed" },
    });
    if (junErr) return { ok: false, error: junErr.message };

    return { ok: true, document_id: documentId, reused: false };
}

/**
 * The stored copy of a COMPOSED document.
 *
 * Same storage owners as the fidelity path — bucket, `documents` row, `form_submission_documents`
 * junction, idempotency key — differing only in what produced the bytes and in what the record
 * honestly claims: `is_source_replica` is false for a composed document and always will be, so the
 * lineage records the composer version rather than a source sha it never had.
 */
async function persistComposedSignedArtifact(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        sub: SubmissionRow;
        schemaJson: unknown;
        formDefinitionId: string;
        title: string;
        marks: Record<string, { typed_full_name: string | null; drawnPng?: Uint8Array | null }>;
        signedAny: boolean;
    },
): Promise<PersistSignedArtifactResult> {
    let schema;
    try {
        schema = validateFormSchema(input.schemaJson);
    } catch {
        return { ok: false, error: "Pinned schema invalid" };
    }

    const templateKey = `composed:${input.formDefinitionId}`;
    const idempotencyKey = buildFormPdfIdempotencyKey({
        formSubmissionId: input.sub.id,
        formDefinitionVersionId: input.sub.form_definition_version_id,
        templateKey,
    });
    const existing = await findExistingGeneratedPdfByIdempotency(supabase, input.sub.id, idempotencyKey);
    if (existing) return { ok: true, document_id: existing, reused: true };

    const parent = resolveFormSubmissionDocumentParent(input.sub);
    if (!parent) return { ok: false, error: "Submission has no entity to attach the artifact to" };
    const okEntity = await assertEntityInOrg(supabase, input.orgId, parent.entity_type, parent.entity_id);
    if (!okEntity) return { ok: false, error: "Linked entity not found for this organization" };

    /*
     * The same provenance the live render showed, read the same way.
     *
     * A composed document names where its questions came from; deriving it differently here would
     * let the stored copy and the screen disagree about the document's own origin.
     */
    const { data: item } = await supabase
        .from("form_packet_session_items")
        .select("packet_item_id")
        .eq("org_id", input.orgId)
        .eq("form_submission_id", input.sub.id)
        .maybeSingle();
    let sourceDocumentId: string | null = null;
    let sourceSha: string | null = null;
    let sourceTitle: string | null = null;
    const packetItemId = (item as { packet_item_id?: string } | null)?.packet_item_id;
    if (packetItemId) {
        const { data: packetItem } = await supabase
            .from("form_packet_items")
            .select("metadata")
            .eq("org_id", input.orgId)
            .eq("id", packetItemId)
            .maybeSingle();
        const ref = (packetItem as { metadata?: { source_document_id?: string } } | null)?.metadata
            ?.source_document_id;
        if (ref) {
            const { data: doc } = await supabase
                .from("documents")
                .select("id, title, file_name, checksum_sha256")
                .eq("org_id", input.orgId)
                .eq("id", ref)
                .maybeSingle();
            const d = doc as { id?: string; title?: string; file_name?: string; checksum_sha256?: string } | null;
            sourceDocumentId = d?.id ?? null;
            sourceSha = d?.checksum_sha256 ?? null;
            sourceTitle = d?.title ?? d?.file_name ?? null;
        }
    }

    const composed = await composeGeneratedDocument({
        schema,
        // The SUBMITTED values, exactly — the stored copy must correspond to what was signed.
        values: (input.sub.payload?.values ?? {}) as Record<string, unknown>,
        provenance: {
            form_definition_id: input.formDefinitionId,
            form_definition_version_id: input.sub.form_definition_version_id,
            source_document_id: sourceDocumentId,
            source_sha256: sourceSha,
            source_title: sourceTitle,
        },
        signatures: Object.fromEntries(
            Object.entries(input.marks).map(([fieldId, m]) => [
                fieldId,
                { drawnPng: m.drawnPng ?? null, typedFullName: m.typed_full_name },
            ]),
        ),
    });

    const bucket = process.env.ADMIN_DOCUMENTS_BUCKET?.trim() || "org_documents";
    const storagePath = `${input.orgId}/${parent.entity_type}/${parent.entity_id}/${randomUUID()}-completed-${sanitize(
        input.title,
    )}.pdf`;
    const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(storagePath, Buffer.from(composed.bytes), { contentType: "application/pdf", upsert: false });
    if (upErr) return { ok: false, error: classifySupabaseStorageError(upErr).message };

    const suffix = input.signedAny ? "signed" : "completed";
    const { data: docRow, error: insErr } = await supabase
        .from("documents")
        .insert({
            org_id: input.orgId,
            entity_type: parent.entity_type,
            entity_id: parent.entity_id,
            doc_type: "generated_form_pdf",
            title: `${input.title} (${suffix})`,
            original_filename: `${sanitize(input.title)}-${suffix}.pdf`,
            mime_type: "application/pdf",
            byte_size: composed.bytes.byteLength,
            bucket,
            storage_path: storagePath,
            status: "uploaded",
            template_key: templateKey,
            generated_from_document_id: sourceDocumentId,
            checksum_sha256: composed.artifactSha256,
            metadata: {
                idempotency_key: idempotencyKey,
                forms_engine: composed.composerVersion,
                version_role: suffix,
                lineage: {
                    composer_version: composed.composerVersion,
                    form_definition_version_id: input.sub.form_definition_version_id,
                    source_document_id: sourceDocumentId,
                    source_sha256: sourceSha,
                    artifact_sha256: composed.artifactSha256,
                    /* A composed record is authoritative as what was collected, never a replica. */
                    is_source_replica: false,
                },
            },
        })
        .select("id")
        .maybeSingle();
    if (insErr || !docRow) {
        await supabase.storage.from(bucket).remove([storagePath]);
        return { ok: false, error: insErr?.message ?? "Document insert failed" };
    }

    const documentId = (docRow as { id: string }).id;
    const { error: junErr } = await supabase.from("form_submission_documents").insert({
        org_id: input.orgId,
        form_submission_id: input.sub.id,
        document_id: documentId,
        role: "generated_pdf",
        metadata: { template_key: templateKey, idempotency_key: idempotencyKey, version_role: suffix },
    });
    if (junErr) return { ok: false, error: junErr.message };

    return { ok: true, document_id: documentId, reused: false };
}
