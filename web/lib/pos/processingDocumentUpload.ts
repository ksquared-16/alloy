import type { ProcessingImportIntent } from "@/lib/pos/processingImportIntent";
import { processingIntentMetadata } from "@/lib/pos/processingImportIntent";
import { resolveDisplayNameWithCollision } from "@/lib/pos/documentInstanceNaming";

export type ProcessingDocumentUploadInput = {
    file: File;
    intent: ProcessingImportIntent;
    displayName: string;
    openProcessingCase?: boolean;
    /**
     * Attach to an EXISTING case as a related source instead of opening a new one.
     *
     * A packet is one case with several sources. Without this the only reachable shape was one
     * case per document, so "Analyse as one packet" had nothing to compose.
     */
    attachToCaseId?: string;
};

export function buildProcessingDocumentUploadForm(input: ProcessingDocumentUploadInput): FormData {
    const form = new FormData();
    form.append("file", input.file);
    if (input.attachToCaseId) {
        form.append("attach_to_case_id", input.attachToCaseId);
    } else if (input.openProcessingCase !== false) {
        form.append("open_processing_case", "true");
    }
    form.append("processing_intent", input.intent);
    form.append("title", resolveDisplayNameWithCollision(input.displayName.trim(), []));
    for (const [key, value] of Object.entries(processingIntentMetadata(input.intent))) {
        form.append(key, String(value));
    }
    return form;
}

export async function uploadProcessingDocument(input: ProcessingDocumentUploadInput): Promise<{
    processing_case_id?: string | null;
    /** `attached` | `already_attached` | a refusal reason, when attaching to an existing case. */
    attach_outcome?: string;
    error?: string;
}> {
    const res = await fetch("/api/admin/documents/upload", {
        method: "POST",
        credentials: "same-origin",
        body: buildProcessingDocumentUploadForm(input),
    });
    const body = (await res.json().catch(() => ({}))) as {
        processing_case_id?: string | null;
        attach_outcome?: string;
        error?: string;
    };
    if (!res.ok) throw new Error(body.error || `Upload failed (${res.status})`);
    return body;
}
