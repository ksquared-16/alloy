import { mapFactsToCreateLeadIntake } from "@/lib/admin/actions/createLead/adapters/mapFactsToCreateLeadIntake";
import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import type {
    IntakeFactExtractionResult,
    IntakeFieldMappingResult,
    IntakeSelectOption,
} from "@/lib/intake/types";

export type ActionIntakeMapperInput = {
    extraction: IntakeFactExtractionResult;
    spec: ActionIntakeSpec;
    field_options?: Partial<Record<string, readonly IntakeSelectOption[]>>;
};

function unsupportedActionIntakeMapping(input: ActionIntakeMapperInput): IntakeFieldMappingResult {
    return {
        action_key: input.spec.action_key,
        candidates: [],
        unmapped_text: input.extraction.unmapped_text,
        household: undefined,
        review_warning_items: [],
        review_warnings: [],
    };
}

/** Dispatch extracted facts to action-specific intake mappers. */
export function mapFactsToActionIntake(input: ActionIntakeMapperInput): IntakeFieldMappingResult {
    if (input.spec.action_key === "create_lead") {
        return mapFactsToCreateLeadIntake(input);
    }
    return unsupportedActionIntakeMapping(input);
}
