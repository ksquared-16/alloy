import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import {
    buildManualFormDraft,
    type ManualFieldInput,
    type SectionDispositionInput,
} from "@/lib/pos/processingCase/formDraft/buildManualFormDraft";
import { SECTION_DISPOSITIONS, type SectionDisposition } from "@/lib/pos/processingCase/formDraft/sectionDisposition";
import { dbStoreFormDraftPreview, stampFormDraftPreview, parseStoredFormDraftPreview } from "@/lib/pos/processingCase/formDraft/formDraftPreviewDb";
import { ocrProvenanceFromDocument } from "@/lib/pos/processingCase/formDraft/ocrDraftProvenance";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/processing/cases/[caseId]/form-draft/save — POS-FP14.
 *
 * Persist an OPERATOR-REVIEWED field list as the case's `form_draft_preview` (the same
 * shape the detector produces) so the existing `/form-draft/create` turns it into an
 * UNPUBLISHED editable form. This is the "set up from the PDF" path when text detection
 * is weak. PREVIEW ONLY — no form row, no publish, no records. Admin-scoped.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const { caseId: rawCaseId } = await params;
    const caseId = parseUuidParam(rawCaseId, "caseId");
    if (caseId instanceof NextResponse) return caseId;

    let body: { title?: unknown; form_name?: unknown; fields?: unknown; section_dispositions?: unknown };
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return jsonError("Invalid JSON body", 400);
    }

    const rawFields = Array.isArray(body.fields) ? body.fields : [];
    const fields: ManualFieldInput[] = rawFields
        .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
        .map((f) => {
            const bbox =
                Array.isArray(f.bbox) && f.bbox.length >= 4 && f.bbox.every((n) => typeof n === "number")
                    ? ([f.bbox[0], f.bbox[1], f.bbox[2], f.bbox[3]] as [number, number, number, number])
                    : undefined;
            // Operator-reviewed canonical binding ({entity_type, field_key}); absent = packet-only/unbound.
            const fs = f.field_source as Record<string, unknown> | undefined;
            const et = fs && typeof fs.entity_type === "string" ? fs.entity_type.trim() : "";
            const fk = fs && typeof fs.field_key === "string" ? fs.field_key.trim() : "";
            const field_source = et && fk
                ? { entity_type: et, field_key: fk, ...(typeof fs!.shared_value_key === "string" ? { shared_value_key: fs!.shared_value_key as string } : {}) }
                : undefined;
            return {
                label: typeof f.label === "string" ? f.label : "",
                type: typeof f.type === "string" ? f.type : undefined,
                required: f.required === true,
                section: typeof f.section === "string" ? f.section : undefined,
                description: typeof f.description === "string" ? f.description : undefined,
                // Preserve PDF provenance when the reviewed field came from AcroForm detection
                // or manual mapping.
                pdf_field_name: typeof f.pdf_field_name === "string" ? f.pdf_field_name : undefined,
                page: typeof f.page === "number" ? f.page : undefined,
                bbox,
                evidence: typeof f.evidence === "string" ? f.evidence : undefined,
                ...(field_source ? { field_source } : {}),
            };
        })
        .filter((f) => f.label.trim().length > 0);

    if (fields.length === 0) {
        return jsonError("Provide at least one field with a label.", 422);
    }

    // Operator-set section dispositions (control the emitted schema — not cosmetic).
    const rawDisp = Array.isArray(body.section_dispositions) ? body.section_dispositions : [];
    const sectionDispositions: SectionDispositionInput[] = rawDisp
        .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
        .map((d) => {
            const title = typeof d.title === "string" ? d.title.trim() : "";
            const dispo = typeof d.disposition === "string" ? d.disposition : "";
            const disposition = (SECTION_DISPOSITIONS as string[]).includes(dispo)
                ? (dispo as SectionDisposition)
                : ("fields" as SectionDisposition);
            const static_text = typeof d.static_text === "string" ? d.static_text : undefined;
            return { title, disposition, ...(static_text ? { static_text } : {}) };
        })
        .filter((d) => d.title.length > 0);

    const supabase = createAdminClient();

    try {
        const { data: caseRow, error: caseErr } = await supabase
            .from("processing_cases")
            .select("id")
            .eq("org_id", ctx.orgId)
            .eq("id", caseId)
            .maybeSingle();
        if (caseErr) throw new Error(caseErr.message);
        if (!caseRow) return jsonError("Not found", 404);

        // Primary document source (for source_document_id + a default title).
        const { data: src } = await supabase
            .from("processing_case_sources")
            .select("source_kind, source_id")
            .eq("org_id", ctx.orgId)
            .eq("processing_case_id", caseId)
            .eq("role", "primary")
            .maybeSingle();
        const source = src as { source_kind?: string; source_id?: string } | null;
        const sourceDocumentId = source?.source_kind === "document" && source.source_id ? source.source_id : null;

        let docTitle: string | null = null;
        // OCR provenance is preserved across the operator-review save so the create step keeps
        // source→OCR→published lineage (the document row is the single source of truth).
        let ocr: ReturnType<typeof ocrProvenanceFromDocument> = null;
        if (sourceDocumentId) {
            const { data: docRow } = await supabase
                .from("documents")
                .select("title, original_filename, extraction_provider, metadata")
                .eq("org_id", ctx.orgId)
                .eq("id", sourceDocumentId)
                .maybeSingle();
            const doc = (docRow ?? {}) as {
                title?: string | null;
                original_filename?: string | null;
                extraction_provider?: string | null;
                metadata?: Record<string, unknown> | null;
            };
            docTitle = doc.title ?? doc.original_filename ?? null;
            ocr = ocrProvenanceFromDocument(doc);
        }

        const title = (typeof body.title === "string" && body.title.trim()) || docTitle || "Untitled form";
        const generatedFormName =
            typeof body.form_name === "string" && body.form_name.trim() ? body.form_name.trim() : null;

        // Preserve Configuration Discovery across the operator-review save so the generated form
        // retains source→discovery→binding lineage (FP16). The operator's bindings live in `fields`;
        // the discovery record explains where each concept came from and how it was matched.
        const { data: caseMetaRow } = await supabase
            .from("processing_cases")
            .select("metadata")
            .eq("org_id", ctx.orgId)
            .eq("id", caseId)
            .maybeSingle();
        const priorPreview = parseStoredFormDraftPreview((caseMetaRow as { metadata?: unknown } | null)?.metadata);
        const priorDiscovery = priorPreview?.configuration_discovery;
        // Relationship collections projected by apply are configuration, not operator-typed questions —
        // save rebuilds the draft from posted fields, so without this they would be silently dropped
        // and the generated form would fall back to flat questions (POS-FP17).
        const priorCollections = priorPreview?.collections;
        const suppressedByCollection = new Map(
            (priorPreview?.fields ?? [])
                .filter((f) => f.suppressed_by_collection)
                .map((f) => [f.label.trim().toLowerCase(), f.suppressed_by_collection!]),
        );

        const rebuilt = buildManualFormDraft({ title, sourceDocumentId, fields, sectionDispositions });
        // Re-apply suppression to the rebuilt questions by label, so a question replaced by a
        // collection group does not reappear as a flat question after a save.
        if (suppressedByCollection.size > 0) {
            for (const f of rebuilt.fields) {
                const groupId = suppressedByCollection.get(f.label.trim().toLowerCase());
                if (groupId) f.suppressed_by_collection = groupId;
            }
        }

        const draft = stampFormDraftPreview({
            ...rebuilt,
            ...(generatedFormName ? { generated_form_name: generatedFormName } : {}),
            ...(ocr ? { ocr } : {}),
            ...(priorDiscovery ? { configuration_discovery: priorDiscovery } : {}),
            ...(priorCollections?.length ? { collections: priorCollections } : {}),
        });
        const stored = await dbStoreFormDraftPreview(supabase, { orgId: ctx.orgId, caseId, draft });
        return jsonData({ caseId, form_draft_preview: stored });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to save form draft" },
            { status: 500 }
        );
    }
}
