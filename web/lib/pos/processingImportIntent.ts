/**
 * Processing import intent vocabulary — persisted on case/document metadata.
 * Do not infer intent from UI state after upload.
 */

export type ProcessingImportIntent =
    | "generate_form"
    | "process_information"
    | "store_document"
    | "packet_source";

/**
 * What an operator is OFFERED when a document arrives.
 *
 * `offered: false` keeps a vocabulary value usable internally while removing it from the chooser.
 * `packet_source` is the case in point: "Analyze as one packet" asked the operator to understand a
 * second analysis mode in order to do the one thing they came to do, which is turn paperwork into a
 * form. The packet machinery is untouched — `form-draft` still accepts `{"mode":"packet"}` and the
 * stored intent still round-trips — it is simply no longer a question put to a person.
 */
export const PROCESSING_IMPORT_INTENT_OPTIONS: ReadonlyArray<{
    value: ProcessingImportIntent;
    label: string;
    description: string;
    available: boolean;
    /** Rendered in the operator's chooser. A value can stay valid without being offered. */
    offered: boolean;
}> = [
    {
        value: "generate_form",
        label: "Create a native form",
        description: "Detect questions, review mappings, and generate an editable Alloy form.",
        available: true,
        offered: true,
    },
    {
        value: "process_information",
        label: "Process information",
        description: "Extract information for review and eventual record updates.",
        available: true,
        offered: true,
    },
    {
        value: "store_document",
        label: "Store on a record",
        description: "Upload and attach the document without generating a form.",
        available: true,
        offered: true,
    },
    {
        value: "packet_source",
        label: "Analyze as one packet",
        description: "Attach this document to the case's packet and analyze every source together.",
        available: true,
        // Still a valid stored intent; no longer a decision an operator is asked to make.
        offered: false,
    },
] as const;

/** The choices actually put to an operator. */
export const OFFERED_PROCESSING_IMPORT_INTENTS = PROCESSING_IMPORT_INTENT_OPTIONS.filter((o) => o.offered);

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
