import type {
    ActionIntakePasteExtractionResult,
    ActionIntakePasteParser,
} from "@/lib/lifecycle/actionIntakePasteParserTypes";
import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import { extractFactsFromText } from "@/lib/intake/extract/extractFactsFromText";
import { mapFactsToActionIntake } from "@/lib/intake/map/mapFactsToActionIntake";

export function parseCreateLeadIntakeText(input: {
    text: string;
    spec: ActionIntakeSpec;
}): ActionIntakePasteExtractionResult {
    const raw_text = input.text.trim();
    if (!raw_text) {
        return { fields: [], unmapped_text: "", raw_text: "" };
    }

    const extraction = extractFactsFromText({ text: raw_text });
    const mapping = mapFactsToActionIntake({ extraction, spec: input.spec });

    const fields = mapping.candidates.map((c) => ({
        payload_key: c.payload_key,
        rule_id: c.rule_id,
        value: c.value,
        confidence: c.confidence,
    }));

    return {
        fields,
        unmapped_text: mapping.unmapped_text ?? extraction.unmapped_text ?? "",
        raw_text,
    };
}

/** Default V1 parser — shared intake engine adapter; swap extractor for AI later. */
export const createLeadIntakePasteParser: ActionIntakePasteParser = {
    parse: parseCreateLeadIntakeText,
};
