/**
 * POS-FP14 — safe server-side fetch of a document's raw bytes from Supabase storage.
 *
 * Needed for AcroForm field extraction (which reads the PDF bytes, not `extracted_text`).
 * Never throws; returns null when the document has no storage location or download fails,
 * so callers (best-effort draft generation) never break.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export async function downloadDocumentBytesSafe(
    supabase: SupabaseClient,
    args: { orgId: string; documentId: string }
): Promise<{ bytes: Uint8Array; mimeType: string | null } | null> {
    try {
        if (!args.orgId || !args.documentId) return null;
        const { data: row, error } = await supabase
            .from("documents")
            .select("bucket, storage_path, mime_type")
            .eq("org_id", args.orgId)
            .eq("id", args.documentId)
            .maybeSingle();
        if (error || !row) return null;
        const r = row as { bucket?: string | null; storage_path?: string | null; mime_type?: string | null };
        const bucket = r.bucket?.trim();
        const path = r.storage_path?.trim();
        if (!bucket || !path) return null;

        const { data, error: dlErr } = await supabase.storage.from(bucket).download(path);
        if (dlErr || !data) return null;
        const buf = await data.arrayBuffer();
        return { bytes: new Uint8Array(buf), mimeType: r.mime_type ?? null };
    } catch (e) {
        console.warn("[downloadDocumentBytesSafe]", e instanceof Error ? e.message : e);
        return null;
    }
}

/** True when the mime/bytes look like a captured HTML page (a hosted-form capture). */
export function looksLikeHtmlBytes(bytes: Uint8Array | null | undefined, mimeType?: string | null): boolean {
    if (mimeType && /html|xhtml/i.test(mimeType)) return true;
    if (!bytes || bytes.length < 14) return false;
    const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 1024)).trimStart().toLowerCase();
    return head.startsWith("<!doctype html") || head.startsWith("<html") || head.includes("<html");
}

/** Decode captured bytes as text. Never throws; returns null when they are not decodable. */
export function decodeCaptureText(bytes: Uint8Array | null | undefined): string | null {
    try {
        if (!bytes || bytes.length === 0) return null;
        const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
        return text.trim() ? text : null;
    } catch {
        return null;
    }
}

/** True when the mime/bytes look like a PDF (AcroForm extraction is PDF-only). */
export function looksLikePdfBytes(bytes: Uint8Array | null | undefined, mimeType?: string | null): boolean {
    if (mimeType && /pdf/i.test(mimeType)) return true;
    if (!bytes || bytes.length < 5) return false;
    // "%PDF-"
    return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}
