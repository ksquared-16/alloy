import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { adminContextFailureResponse, getAdminContextCached } from "@/lib/admin/getAdminContext";
import { parseUuidParam } from "@/lib/admin/forms/formsAdminResponses";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/pos/documents/[id]/extracted-text — POS-FP16.
 *
 * Returns the FULL extracted text for a document (the draft only stores a short preview),
 * so the Template Setup "Extracted text" tab can show + search the whole thing for
 * troubleshooting. Read-only, org-scoped. No OCR — just the text the extractor already
 * stored on `documents.extracted_text`.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContextCached();
    if (!ctx.ok) return adminContextFailureResponse(ctx);

    const { id: rawId } = await params;
    const documentId = parseUuidParam(rawId, "id");
    if (documentId instanceof NextResponse) return documentId;

    const supabase = createAdminClient();
    try {
        const { data, error } = await supabase
            .from("documents")
            .select("extracted_text")
            .eq("org_id", ctx.orgId)
            .eq("id", documentId)
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
        const text = typeof (data as { extracted_text?: string | null }).extracted_text === "string"
            ? ((data as { extracted_text: string }).extracted_text)
            : "";
        return NextResponse.json({ ok: true, text, length: text.length });
    } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
    }
}
