/**
 * POS-FP11 — safe document text extraction abstraction (stub).
 *
 * There is NO PDF/OCR dependency installed, so this does not parse file bytes. It is
 * the seam where real extraction lands later. Today it honestly reports text only if
 * something has already populated `documents.extracted_text` (the column exists and is
 * reserved for a future extractor); otherwise it returns `available:false` with a
 * machine reason. It NEVER throws — callers (e.g. upload) must never fail on it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DocumentTextResult } from "./types";

const UNAVAILABLE = (reason: string): DocumentTextResult => ({ available: false, text: null, reason });

export async function extractDocumentTextSafe(
    supabase: SupabaseClient,
    args: { orgId: string; documentId: string }
): Promise<DocumentTextResult> {
    try {
        if (!args.orgId || !args.documentId) return UNAVAILABLE("missing_identifiers");

        const { data, error } = await supabase
            .from("documents")
            .select("extracted_text, mime_type")
            .eq("org_id", args.orgId)
            .eq("id", args.documentId)
            .maybeSingle();
        if (error) return UNAVAILABLE("document_query_failed");
        if (!data) return UNAVAILABLE("document_not_found");

        const row = data as { extracted_text?: string | null; mime_type?: string | null };
        const text = typeof row.extracted_text === "string" ? row.extracted_text.trim() : "";
        if (text.length > 0) {
            return { available: true, text, reason: null };
        }

        // No text yet. Be specific so the UI can say "extraction pending" vs "unsupported".
        const mime = (row.mime_type ?? "").toLowerCase();
        if (mime.includes("pdf")) return UNAVAILABLE("no_text_extractor_installed");
        return UNAVAILABLE("no_extracted_text");
    } catch (e) {
        console.warn("[extractDocumentTextSafe]", e instanceof Error ? e.message : e);
        return UNAVAILABLE("extraction_error");
    }
}

/** Human-readable reason for the UI (kept out of the data layer so it stays presentational). */
export function describeTextUnavailableReason(reason: string | null): string {
    switch (reason) {
        case "no_text_extractor_installed":
            return "Text extraction isn’t wired for PDFs yet — structure detection needs document text.";
        case "no_extracted_text":
            return "No text is available for this document yet.";
        case "document_not_found":
            return "Document not found.";
        case "missing_identifiers":
        case "document_query_failed":
        case "extraction_error":
            return "Document text couldn’t be read.";
        default:
            return "Document text is unavailable.";
    }
}
