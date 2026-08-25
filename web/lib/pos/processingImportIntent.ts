/**
 * Processing import intent vocabulary — persisted on case/document metadata.
 * Do not infer intent from UI state after upload.
 */

export type ProcessingImportIntent =
    | "generate_form"
    | "process_information"
    | "store_document"
    | "packet_source";

export const PROCESSING_IMPORT_INTENT_OPTIONS: ReadonlyArray<{
    value: ProcessingImportIntent;
    label: string;
    description: string;
    available: boolean;
}> = [
    {
        value: "generate_form",
        label: "Create a native form",
        description: "Detect questions, review mappings, and generate an editable Alloy form.",
        available: true,
    },
    {
        value: "process_information",
        label: "Process information",
        description: "Extract information for review and eventual record updates.",
        available: true,
    },
    {
        value: "store_document",
        label: "Store on a record",
        description: "Upload and attach the document without generating a form.",
        available: true,
    },
    {
        value: "packet_source",
        label: "Analyze as one packet",
        description: "Attach this document to the case's packet and analyze every source together.",
        available: true,
    },
] as const;

export function isProcessingImportIntent(value: unknown): value is ProcessingImportIntent {
    return (
        value === "generate_form" ||
        value === "process_information" ||
        value === "store_document" ||
        value === "packet_source"
    );
}

export function processingIntentMetadata(intent: ProcessingImportIntent): Record<string, unknown> {
    return {
        processing_intent: intent,
        import_purpose: intent,
    };
}

/** Read persisted import intent from case/document metadata — never infer from UI state. */
export function parseProcessingIntentFromMetadata(metadata: unknown): ProcessingImportIntent | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const raw = (metadata as Record<string, unknown>).processing_intent ?? (metadata as Record<string, unknown>).import_purpose;
    return isProcessingImportIntent(raw) ? raw : null;
}
