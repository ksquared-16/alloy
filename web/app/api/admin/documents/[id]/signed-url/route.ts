import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";
import { classifySupabaseStorageError } from "@/lib/admin/storageDocumentErrors";

const EXPIRES_IN = 60 * 10;

/** GET: signed URL for a document row the admin org owns. */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json(
            { ok: false, error: ctx.status === 401 ? "Unauthorized" : "Forbidden", code: "AUTH" },
            { status: ctx.status }
        );
    }

    const { id } = await context.params;
    if (!id) return NextResponse.json({ ok: false, error: "Missing id", code: "BAD_REQUEST" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: row, error: rowErr } = await supabase
        .from("documents")
        .select("id, org_id, bucket, storage_path")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (rowErr) {
        console.error("[DOCUMENT_SIGNED_URL_DB]", rowErr);
        return NextResponse.json(
            { ok: false, error: "Could not load document", code: "DOCUMENT_QUERY_FAILED" },
            { status: 500 }
        );
    }

    if (!row) {
        return NextResponse.json({ ok: false, error: "Document not found", code: "NOT_FOUND" }, { status: 404 });
    }

    const bucket = (row as { bucket?: string | null }).bucket?.trim();
    const path = (row as { storage_path?: string | null }).storage_path?.trim();
    if (!bucket || !path) {
        return NextResponse.json(
            {
                ok: false,
                error: "This document has no file in storage (missing bucket or path). Re-upload or fix the row.",
                code: "NO_STORAGE_LOCATION",
            },
            { status: 400 }
        );
    }

    const { data, error: signErr } = await supabase.storage.from(bucket).createSignedUrl(path, EXPIRES_IN);
    if (signErr || !data?.signedUrl) {
        console.error("[DOCUMENT_SIGNED_URL_STORAGE]", bucket, path, signErr);
        const classified = classifySupabaseStorageError(signErr);
        return NextResponse.json(
            { ok: false, error: classified.message, code: classified.code },
            { status: classified.httpStatus }
        );
    }

    return NextResponse.json({ ok: true, signedUrl: data.signedUrl });
}
