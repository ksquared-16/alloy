import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { jsonData, jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";
import { buildManualFormDraft, type ManualFieldInput } from "@/lib/pos/processingCase/formDraft/buildManualFormDraft";
import { dbStoreFormDraftPreview, stampFormDraftPreview } from "@/lib/pos/processingCase/formDraft/formDraftPreviewDb";

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

    let body: { title?: unknown; fields?: unknown };
    try {
        body = (await request.json()) as typeof body;
    } catch {
        return jsonError("Invalid JSON body", 400);
    }

    const rawFields = Array.isArray(body.fields) ? body.fields : [];
    const fields: ManualFieldInput[] = rawFields
        .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
        .map((f) => ({
            label: typeof f.label === "string" ? f.label : "",
            type: typeof f.type === "string" ? f.type : undefined,
            required: f.required === true,
            section: typeof f.section === "string" ? f.section : undefined,
        }))
        .filter((f) => f.label.trim().length > 0);

    if (fields.length === 0) {
        return jsonError("Provide at least one field with a label.", 422);
    }

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
        if (sourceDocumentId) {
            const { data: docRow } = await supabase
                .from("documents")
                .select("title, original_filename")
                .eq("org_id", ctx.orgId)
                .eq("id", sourceDocumentId)
                .maybeSingle();
            const doc = (docRow ?? {}) as { title?: string | null; original_filename?: string | null };
            docTitle = doc.title ?? doc.original_filename ?? null;
        }

        const title = (typeof body.title === "string" && body.title.trim()) || docTitle || "Untitled form";

        const draft = stampFormDraftPreview(
            buildManualFormDraft({ title, sourceDocumentId, fields })
        );
        const stored = await dbStoreFormDraftPreview(supabase, { orgId: ctx.orgId, caseId, draft });
        return jsonData({ caseId, form_draft_preview: stored });
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to save form draft" },
            { status: 500 }
        );
    }
}
