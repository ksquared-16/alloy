/**
 * Admin multipart upload for `public.documents` + Supabase Storage.
 *
 * Supabase assumptions (validate in each environment):
 * - **Bucket**: exists and is writable by the **service role** used by `createAdminClient()`.
 *   Default bucket name: `org_documents`. Override with env **`ADMIN_DOCUMENTS_BUCKET`** if you use another name.
 * - **Path layout**: `{org_id}/{canonical_entity_type}/{entity_id}/{uuid}-{safe_filename}` — keeps objects org-scoped and easy to audit.
 * - **RLS**: service role bypasses RLS; row insert still sets **`org_id`** from admin context.
 * - **Signed URLs**: `GET /api/admin/documents/[id]/signed-url` uses the same bucket + `storage_path` on the row; bucket must allow **read** for the service role when creating signed URLs.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContextCached } from "@/lib/admin/getAdminContext";
import { assertEntityInOrg } from "@/lib/admin/assertEntityInOrg";
import { normalizeDocumentRow } from "@/lib/admin/normalizeDocumentRow";
import { classifySupabaseStorageError } from "@/lib/admin/storageDocumentErrors";
import { emitEvent } from "@/lib/emitEvent";
import { resolveUploadEntityTarget } from "@/lib/admin/resolveUploadEntityTarget";
import { maybeOpenProcessingCaseFromNonFormSourceSafe } from "@/lib/pos/processingCase/maybeOpenProcessingCaseFromNonFormSourceSafe";
import { maybeClassifyProcessingCaseFromDocumentSafe } from "@/lib/pos/processingCase/classification/maybeClassifyProcessingCaseFromDocumentSafe";
import { maybeExtractProcessingCaseFromDocumentSafe } from "@/lib/pos/processingCase/extraction/maybeExtractProcessingCaseFromDocumentSafe";
import { maybeBuildDocumentFormPreviewSafe } from "@/lib/pos/processingCase/structure/maybeBuildDocumentFormPreviewSafe";
import { buildDocumentTextUpdate, extractPdfText, looksLikePdf } from "@/lib/pos/processingCase/structure/pdfTextExtract";
import { OCR_METHOD, looksLikeImage, ocrImageBytes, ocrPdfBytes, type OcrResult } from "@/lib/pos/processingCase/structure/ocrExtract";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    capabilitiesForFormat,
    detectProcessingSourceFormat,
} from "@/lib/pos/processingSourceCapabilities";
import {
    isProcessingImportIntent,
    processingIntentMetadata,
    type ProcessingImportIntent,
} from "@/lib/pos/processingImportIntent";
import { proposeImportDisplayName, resolveDisplayNameWithCollision } from "@/lib/pos/documentInstanceNaming";

export const DEFAULT_ORG_DOCUMENTS_BUCKET = "org_documents";

/** Map UI / drawer entity types to canonical documents.entity_type values. */
const CANONICAL_ENTITY_TYPE: Record<string, string> = {
    customers: "customer",
    customer: "customer",
    contacts: "contact",
    contact: "contact",
    opportunities: "opportunity",
    opportunity: "opportunity",
    jobs: "job",
    job: "job",
    locations: "location",
    location: "location",
    customer_members: "customer_member",
    customer_member: "customer_member",
    vendors: "vendor",
    vendor: "vendor",
    persons: "person",
    person: "person",
    schedules: "schedule",
    schedule: "schedule",
};

function sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180) || "file";
}

/**
 * Persist a governed OCR result onto the document row (single writer for both the image and the
 * scanned-PDF paths). Records text + confidence + method + provenance so the SAME extraction review
 * runs over OCR text and the published form retains source→OCR→published lineage.
 */
async function applyOcrDocumentUpdate(
    supabase: SupabaseClient,
    args: { orgId: string; docId: string; baseMeta: Record<string, unknown>; ocr: OcrResult }
): Promise<void> {
    const { ocr } = args;
    await supabase
        .from("documents")
        .update({
            extracted_text: ocr.text,
            extraction_status: ocr.text.trim() ? "complete" : "empty",
            extraction_provider: OCR_METHOD,
            metadata: {
                ...args.baseMeta,
                ocr_derived: true,
                ocr_confidence: ocr.confidence,
                ocr_low_confidence: ocr.lowConfidence,
                ocr_method: ocr.method,
                ocr_source_kind: ocr.sourceKind,
                ocr_page_count: ocr.pageCount,
                ocr_truncated: ocr.truncated,
            },
        })
        .eq("org_id", args.orgId)
        .eq("id", args.docId);
}

/** POST multipart: file + entity_type + entity_id; optional doc_type, title. Admin only (matches canMutate). */
export async function POST(request: NextRequest) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) {
        return NextResponse.json({ error: ctx.status === 401 ? "Unauthorized" : "Forbidden", code: "AUTH" }, { status: ctx.status });
    }
    if (ctx.role !== "admin") {
        return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
    }

    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        return NextResponse.json({ error: "Expected multipart form data", code: "BAD_REQUEST" }, { status: 400 });
    }

    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
        return NextResponse.json({ error: "file is required", code: "MISSING_FILE" }, { status: 400 });
    }

    const entityTypeRaw = typeof formData.get("entity_type") === "string" ? (formData.get("entity_type") as string).trim() : "";
    const entityId = typeof formData.get("entity_id") === "string" ? (formData.get("entity_id") as string).trim() : "";
    const docType = typeof formData.get("doc_type") === "string" ? (formData.get("doc_type") as string).trim() || null : null;
    const titleRaw = typeof formData.get("title") === "string" ? (formData.get("title") as string).trim() || null : null;
    const intentRaw = formData.get("processing_intent");
    const processingIntent: ProcessingImportIntent = isProcessingImportIntent(intentRaw)
        ? intentRaw
        : "generate_form";
    // POS-FP1c opt-in: when explicitly requested, route the uploaded document into the
    // existing Processing Case spine (non-form on-ramp). Default OFF — existing callers
    // that don't send this flag are completely unaffected.
    const openProcessingCase = formData.get("open_processing_case") === "true";

    // Resolve where this document attaches. Normal uploads still require a valid entity;
    // POS intake (open_processing_case=true) may upload without one (entity-less artifact).
    const target = resolveUploadEntityTarget({ openProcessingCase, entityTypeRaw, entityId }, CANONICAL_ENTITY_TYPE);
    if (!target.ok) {
        return NextResponse.json({ error: target.message, code: target.code }, { status: 400 });
    }

    const supabase = createAdminClient();
    const origName = file instanceof File && file.name ? file.name : "upload";
    const mimeType = file.type || "";
    const sourceFormat = detectProcessingSourceFormat(origName, mimeType);
    const formatCaps = capabilitiesForFormat(sourceFormat);
    if (!formatCaps.store) {
        return NextResponse.json(
            {
                error: `${formatCaps.label} is not supported for Processing intake.`,
                code: "UNSUPPORTED_FORMAT",
                format: sourceFormat,
            },
            { status: 415 }
        );
    }

    const canonicalType: string | null = target.mode === "entity" ? target.canonicalType : null;
    const rowEntityId: string | null = target.mode === "entity" ? target.entityId : null;
    if (target.mode === "entity") {
        const okEntity = await assertEntityInOrg(supabase, ctx.orgId, target.canonicalType, target.entityId);
        if (!okEntity) {
            return NextResponse.json({ error: "Entity not found for this organization", code: "ENTITY_NOT_FOUND" }, { status: 404 });
        }
    }

    const bucket = process.env.ADMIN_DOCUMENTS_BUCKET?.trim() || DEFAULT_ORG_DOCUMENTS_BUCKET;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const safeName = sanitizeFilename(origName);
    const objectId = randomUUID();
    const pathSegment = canonicalType ? `${canonicalType}/${rowEntityId}` : "pos_intake";
    const storagePath = `${ctx.orgId}/${pathSegment}/${objectId}-${safeName}`;

    const { error: upErr } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
    });

    if (upErr) {
        console.error("[DOCUMENTS_UPLOAD_STORAGE]", bucket, storagePath, upErr);
        const classified = classifySupabaseStorageError(upErr);
        return NextResponse.json(
            { error: classified.message, code: classified.code },
            { status: classified.httpStatus }
        );
    }

    // Profile photos are identity assets — skip org-wide title scan + OCR/POS intake.
    // Awaiting tesseract on a face photo was hanging Focus Panel "Save photo" indefinitely.
    const isProfilePhoto = (docType ?? "").trim().toLowerCase() === "profile_photo";

    let title: string;
    if (isProfilePhoto) {
        title = (titleRaw ?? origName ?? "Profile photo").trim() || "Profile photo";
    } else {
        const { data: existingTitles } = await supabase.from("documents").select("title").eq("org_id", ctx.orgId);
        const existingDisplayNames = ((existingTitles ?? []) as Array<{ title?: string | null }>)
            .map((row) => (row.title ?? "").trim())
            .filter(Boolean);

        const proposedTitle =
            titleRaw ??
            proposeImportDisplayName({
                fileName: origName,
                receivedAt: new Date().toISOString(),
                existingDisplayNames,
            });
        title = resolveDisplayNameWithCollision(proposedTitle, existingDisplayNames);
    }

    const { data: row, error: insErr } = await supabase
        .from("documents")
        .insert({
            org_id: ctx.orgId,
            entity_type: canonicalType,
            entity_id: rowEntityId,
            doc_type: docType,
            title,
            original_filename: origName !== "upload" ? origName : null,
            mime_type: mimeType || null,
            byte_size: buffer.length,
            bucket,
            storage_path: storagePath,
            status: "uploaded",
            metadata: {
                processing_intent: processingIntent,
                ...processingIntentMetadata(processingIntent),
                source_format: sourceFormat,
                ...(isProfilePhoto ? { profile_photo: true } : {}),
            },
        })
        .select("*")
        .single();

    if (insErr) {
        console.error("[DOCUMENTS_UPLOAD_DB]", insErr);
        await supabase.storage.from(bucket).remove([storagePath]).catch((e) => console.error("[DOCUMENTS_UPLOAD_ROLLBACK]", e));
        const pgCode = insErr.code === "23505" ? "DOCUMENT_DUPLICATE" : "DOCUMENT_INSERT_FAILED";
        return NextResponse.json(
            {
                error: insErr.message || "Failed to save document record after upload.",
                code: pgCode,
            },
            { status: 500 }
        );
    }

    const document = normalizeDocumentRow(row as Record<string, unknown>);
    const docId = (row as { id: string }).id;

    if (isProfilePhoto) {
        try {
            await emitEvent({
                org_id: ctx.orgId,
                event_type: "document_uploaded",
                entity_type: "documents",
                entity_id: docId,
                payload: {
                    canonical_entity_type: canonicalType,
                    entity_id: rowEntityId,
                    doc_type: docType,
                    storage_path: storagePath,
                    actor_user_id: ctx.userId,
                    profile_photo: true,
                },
            });
        } catch (e) {
            console.warn("[documents/upload] emitEvent profile_photo", e instanceof Error ? e.message : e);
        }
        return NextResponse.json({
            document,
            raw: row,
            processing_case_id: null,
            classification_key: null,
            extraction_candidate_count: null,
        });
    }

    // POS-FP11b: best-effort text-only PDF extraction. We already have the bytes in
    // memory. On success the text lands on `documents.extracted_text` so the structure
    // preview (below) can use it. NEVER blocks the upload — any failure is swallowed and
    // recorded as an extraction status. No OCR; scanned PDFs simply yield no text.
    if (looksLikePdf(mimeType, origName)) {
        try {
            const pdfResult = await extractPdfText(new Uint8Array(buffer));
            const textUpdate = buildDocumentTextUpdate(pdfResult);
            await supabase.from("documents").update(textUpdate).eq("org_id", ctx.orgId).eq("id", docId);

            // Scanned PDF: a real PDF with no native text layer. Detect it (no_text) and run the
            // governed OCR path — rasterize pages server-side, OCR them, and record the same OCR
            // provenance as image sources so the identical review-and-correction flow applies.
            if (!pdfResult.text) {
                const ocr = await ocrPdfBytes(new Uint8Array(buffer));
                if (ocr && ocr.text.trim()) {
                    await applyOcrDocumentUpdate(supabase, {
                        orgId: ctx.orgId,
                        docId,
                        baseMeta: (row as { metadata?: Record<string, unknown> }).metadata ?? {},
                        ocr,
                    });
                }
            }
        } catch (e) {
            console.warn("[documents/upload] pdf text extraction", e instanceof Error ? e.message : e);
        }
    } else if (sourceFormat === "txt" || sourceFormat === "csv") {
        try {
            const text = buffer.toString("utf8");
            await supabase
                .from("documents")
                .update({
                    extracted_text: text,
                    extraction_status: text.trim() ? "complete" : "empty",
                })
                .eq("org_id", ctx.orgId)
                .eq("id", docId);
        } catch (e) {
            console.warn("[documents/upload] text file extraction", e instanceof Error ? e.message : e);
        }
    } else if (looksLikeImage(mimeType, origName)) {
        // Governed OCR path (Phase 7 Stage B): scanned / image-based source has no native text or form
        // fields. OCR it server-side and preserve text + confidence + method; the same review-and-
        // correction flow then runs over the OCR text. Best-effort — never blocks the upload.
        try {
            const ocr = await ocrImageBytes(new Uint8Array(buffer));
            if (ocr) {
                await applyOcrDocumentUpdate(supabase, {
                    orgId: ctx.orgId,
                    docId,
                    baseMeta: (row as { metadata?: Record<string, unknown> }).metadata ?? {},
                    ocr,
                });
            }
        } catch (e) {
            console.warn("[documents/upload] image OCR extraction", e instanceof Error ? e.message : e);
        }
    }

    try {
        await emitEvent({
            org_id: ctx.orgId,
            event_type: "document_uploaded",
            entity_type: "documents",
            entity_id: docId,
            payload: {
                canonical_entity_type: canonicalType,
                entity_id: rowEntityId,
                doc_type: docType,
                storage_path: storagePath,
                actor_user_id: ctx.userId,
            },
        });
    } catch (e) {
        console.warn("[documents/upload] emitEvent", e instanceof Error ? e.message : e);
    }

    // POS-FP1c: opt-in, best-effort non-form on-ramp. Reuses the existing Processing
    // Case engine (idempotent on the primary source); never throws, never blocks the
    // upload response. No extraction/matching/commit happens here — that stays honest
    // in the review spine (a document source resolves to a "routed" no-op on approval).
    let processingCaseId: string | null = null;
    let classificationKey: string | null = null;
    let candidateCount: number | null = null;
    // Defensive outer guard: the upload has already succeeded (storage + row + event).
    // Opening the case / classification / extraction are all best-effort and must NEVER
    // turn a successful upload into a failed response, even if a helper is changed later.
    try {
      if (openProcessingCase) {
        const opened = await maybeOpenProcessingCaseFromNonFormSourceSafe(supabase, {
            orgId: ctx.orgId,
            sourceKind: "document",
            sourceId: docId,
        });
        processingCaseId = opened?.processingCaseId ?? null;

        if (processingCaseId) {
            const { data: caseRow } = await supabase
                .from("processing_cases")
                .select("metadata")
                .eq("org_id", ctx.orgId)
                .eq("id", processingCaseId)
                .maybeSingle();
            const existingMeta =
                caseRow?.metadata && typeof caseRow.metadata === "object" && !Array.isArray(caseRow.metadata)
                    ? (caseRow.metadata as Record<string, unknown>)
                    : {};
            await supabase
                .from("processing_cases")
                .update({
                    metadata: {
                        ...existingMeta,
                        ...processingIntentMetadata(processingIntent),
                        source_document_display_name: title,
                        source_document_filename: origName,
                    },
                })
                .eq("org_id", ctx.orgId)
                .eq("id", processingCaseId);
        }

        // POS-FP9: classify the opened case from cheap document signals (filename /
        // mime / doc_type / metadata). Classification ONLY — no extraction, no record
        // writes, no status change. Best-effort; never blocks the upload response.
        if (processingCaseId) {
            const docRow = row as {
                original_filename?: string | null;
                mime_type?: string | null;
                doc_type?: string | null;
                title?: string | null;
                metadata?: Record<string, unknown> | null;
            };
            const classified = await maybeClassifyProcessingCaseFromDocumentSafe(supabase, {
                orgId: ctx.orgId,
                caseId: processingCaseId,
                // Trust adoption Phase 1.1: the deterministic classification is
                // also recorded as an immutable Decision Package. Additive — it
                // cannot change or withhold what Processing stores, so
                // `classificationKey` below is unaffected either way.
                governance: {},
                document: {
                    sourceKind: "document",
                    fileName: docRow.original_filename ?? origName,
                    mimeType: docRow.mime_type ?? (file.type || null),
                    docType: docRow.doc_type ?? docType,
                    title: docRow.title ?? title,
                    metadata: docRow.metadata ?? null,
                },
            });
            classificationKey = classified?.classification_key ?? null;

            // POS-FP10 (intake-aligned): run the shared intake pipeline (document → facts →
            // field candidates) for the classified case. PROPOSALS ONLY — no extraction of
            // record truth, no matching, no commit, no status change. Best-effort.
            if (classified) {
                const docMeta = (docRow.metadata ?? null) as Record<string, unknown> | null;
                candidateCount =
                    (
                        await maybeExtractProcessingCaseFromDocumentSafe(supabase, {
                            orgId: ctx.orgId,
                            caseId: processingCaseId,
                            classificationKey: classified.classification_key,
                            sourceId: docId,
                            document: {
                                fileName: docRow.original_filename ?? origName,
                                title: docRow.title ?? title,
                                docType: docRow.doc_type ?? docType,
                                metadata: docMeta,
                            },
                        })
                    )?.candidates.length ?? null;
            }

            // POS-FP11: build a Document → Form structure PREVIEW (text → sections/fields).
            // Preview only — no form created, no publish, no record write. Best-effort;
            // honest empty preview when no document text is available.
            await maybeBuildDocumentFormPreviewSafe(supabase, {
                orgId: ctx.orgId,
                caseId: processingCaseId,
                documentId: docId,
            });
        }
      }
    } catch (e) {
        // Swallowed: a successful upload must not be reported as a failure because a
        // downstream best-effort step (open case / classify / extract) errored.
        console.warn("[documents/upload] processing-case side-effect", e instanceof Error ? e.message : e);
    }

    return NextResponse.json({
        document,
        raw: row,
        processing_case_id: processingCaseId,
        classification_key: classificationKey,
        extraction_candidate_count: candidateCount,
    });
}
