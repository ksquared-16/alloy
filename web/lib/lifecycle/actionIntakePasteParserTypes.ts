import type { IntakeHouseholdCandidate } from "@/lib/intake/types";
import type { IntakeReviewWarning } from "@/lib/intake/review/intakeReviewWarnings";
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
    /** Flattened operator messages — prefer review_warning_items when present. */
    review_warnings?: string[];
    /** Structured review warnings from shared intake engine. */
    review_warning_items?: IntakeReviewWarning[];
    /** Grouped related-record candidates from shared intake engine. */
    household?: IntakeHouseholdCandidate;
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
