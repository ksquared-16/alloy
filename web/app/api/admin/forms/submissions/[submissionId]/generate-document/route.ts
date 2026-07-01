import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { createGeneratedPdfForSubmission } from "@/lib/forms/pdf/createGeneratedPdfForSubmission";
import { emitFormDocumentGeneratedSafe } from "@/lib/forms/workflow/formSubmissionEvents";
import { dbGetSubmission } from "@/lib/admin/forms/formsAdminDb";
import { jsonError, parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";

/** POST /api/admin/forms/submissions/[submissionId]/generate-document — stub PDF via pdf_mapping_json → documents + junction. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ submissionId: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);
    if (ctx.role !== "admin") return jsonError("Forbidden", 403);

    const { submissionId: raw } = await params;
    const submissionId = parseUuidParam(raw, "submissionId");
    if (submissionId instanceof NextResponse) return submissionId;

    let body: { force_regenerate?: boolean; generated_from_document_id?: string | null } = {};
    try {
        const parsed = await request.json();
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            body = parsed as typeof body;
        }
    } catch {
        /* empty */
    }

    const forceRegenerate = body.force_regenerate === true;
    const generatedFrom =
        typeof body.generated_from_document_id === "string" && body.generated_from_document_id.trim()
            ? body.generated_from_document_id.trim()
            : null;

    const supabase = createAdminClient();
    const result = await createGeneratedPdfForSubmission(supabase, {
        orgId: ctx.orgId,
        submissionId,
        forceRegenerate,
        generatedFromDocumentId: generatedFrom,
    });

    if (!result.ok) {
        return NextResponse.json({ error: result.error, code: result.code }, { status: result.httpStatus });
    }

    if (!result.reused) {
        const { data: sub } = await dbGetSubmission(supabase, ctx.orgId, submissionId);
        if (sub) {
            await emitFormDocumentGeneratedSafe(sub as Parameters<typeof emitFormDocumentGeneratedSafe>[0], result.document_id);
        }
    }

    return NextResponse.json({
        document_id: result.document_id,
        reused: result.reused,
    });
}
