import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";

export type ActionIntakePasteConfidence = "high" | "medium" | "low" | "invalid";

export type ActionIntakePasteExtractedField = {
    payload_key: string;
    rule_id: string | null;
    value: string;
    confidence: ActionIntakePasteConfidence;
};

export type ActionIntakePasteExtractionResult = {
    fields: ActionIntakePasteExtractedField[];
    /** Text that could not be mapped to a known field. */
    unmapped_text: string;
    raw_text: string;
    /** Household grouping + location resolution warnings for operator review. */
    review_warnings?: string[];
};

/** Swappable boundary for BOS-assisted paste parsing (V1: deterministic; later: AI). */
export type ActionIntakePasteParser = {
    parse: (input: {
        text: string;
        spec: ActionIntakeSpec;
        field_options?: Partial<Record<string, readonly { value: string; label: string }[]>>;
    }) => ActionIntakePasteExtractionResult;
};

export type ActionIntakePasteFieldMeta = {
    confidence: ActionIntakePasteConfidence;
    from_paste: true;
};
