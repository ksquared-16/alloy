import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { getAdminContext } from "@/lib/admin/getAdminContext";

const EXPIRES_IN = 60 * 10;

/** GET: signed URL for a document row the admin org owns. */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const ctx = await getAdminContext();
    if (!ctx.ok) {
        return NextResponse.json({ ok: false, error: ctx.status === 401 ? "Unauthorized" : "Forbidden" }, { status: ctx.status });
    }

    const { id } = await context.params;
    if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

    const supabase = createAdminClient();
    const { data: row, error } = await supabase
        .from("documents")
        .select("id, org_id, bucket, storage_path")
        .eq("id", id)
        .eq("org_id", ctx.orgId)
        .maybeSingle();

    if (error || !row) {
        return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
    }

    const bucket = (row as { bucket?: string | null }).bucket?.trim();
    const path = (row as { storage_path?: string | null }).storage_path?.trim();
    if (!bucket || !path) {
        return NextResponse.json({ ok: false, error: "Document has no storage location" }, { status: 400 });
    }

    const { data, error: signErr } = await supabase.storage.from(bucket).createSignedUrl(path, EXPIRES_IN);
    if (signErr || !data?.signedUrl) {
        console.error("[DOCUMENT_SIGNED_URL]", signErr);
        return NextResponse.json({ ok: false, error: signErr?.message ?? "Failed to sign URL" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, signedUrl: data.signedUrl });
}
