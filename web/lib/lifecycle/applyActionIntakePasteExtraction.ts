import type { ActionIntakePasteFieldMeta } from "@/lib/lifecycle/actionIntakePasteParserTypes";
import type { ActionIntakePasteExtractionResult } from "@/lib/lifecycle/actionIntakePasteParserTypes";

export type ApplyActionIntakePasteExtractionResult = {
    values: Record<string, string>;
    field_meta: Record<string, ActionIntakePasteFieldMeta>;
};

/**
 * Merge paste extraction into draft field values.
 * By default only fills empty fields; `overwrite` replaces paste-tagged fields on re-parse.
 */
export function applyActionIntakePasteExtraction(input: {
    current_values: Record<string, string>;
    current_meta: Record<string, ActionIntakePasteFieldMeta>;
    extraction: ActionIntakePasteExtractionResult;
    overwrite?: boolean;
}): ApplyActionIntakePasteExtractionResult {
    const values = { ...input.current_values };
    const field_meta = { ...input.current_meta };

    for (const field of input.extraction.fields) {
        const existing = (values[field.payload_key] ?? "").trim();
        const wasPaste = Boolean(field_meta[field.payload_key]?.from_paste);
        const shouldApply = !existing || input.overwrite || wasPaste;

        if (!shouldApply) continue;

        values[field.payload_key] = field.value;
        field_meta[field.payload_key] = {
            confidence: field.confidence,
            from_paste: true,
        };
    }

    return { values, field_meta };
}
