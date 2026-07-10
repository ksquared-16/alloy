import type { ProcessingImportIntent } from "@/lib/pos/processingImportIntent";
import { processingIntentMetadata } from "@/lib/pos/processingImportIntent";
import { resolveDisplayNameWithCollision } from "@/lib/pos/documentInstanceNaming";

export type ProcessingDocumentUploadInput = {
    file: File;
    intent: ProcessingImportIntent;
    displayName: string;
    openProcessingCase?: boolean;
};

export function buildProcessingDocumentUploadForm(input: ProcessingDocumentUploadInput): FormData {
    const form = new FormData();
    form.append("file", input.file);
    if (input.openProcessingCase !== false) {
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
    error?: string;
}> {
    const res = await fetch("/api/admin/documents/upload", {
        method: "POST",
        credentials: "same-origin",
        body: buildProcessingDocumentUploadForm(input),
    });
    const body = (await res.json().catch(() => ({}))) as {
        processing_case_id?: string | null;
        error?: string;
    };
    if (!res.ok) throw new Error(body.error || `Upload failed (${res.status})`);
    return body;
}
