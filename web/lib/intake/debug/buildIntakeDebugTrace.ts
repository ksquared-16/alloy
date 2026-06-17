import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import { extractFactsFromText } from "@/lib/intake/extract/extractFactsFromText";
import { groupFactsIntoHouseholdCandidates } from "@/lib/intake/group/groupFactsIntoHouseholdCandidates";
import { mapFactsToActionIntake } from "@/lib/intake/map/mapFactsToActionIntake";
import type { IntakeHouseholdCandidate, IntakeSelectOption } from "@/lib/intake/types";
import { formatIntakeReviewWarnings } from "@/lib/intake/review/intakeReviewWarnings";

export type IntakeDebugTrace = {
    raw_text: string;
    facts: ReturnType<typeof extractFactsFromText>["facts"];
    household: IntakeHouseholdCandidate;
    mapped_fields: Array<{ payload_key: string; value: string; confidence: string }>;
    review_warnings: string[];
    commit_limited: boolean;
};

export function buildIntakeDebugTrace(input: {
    text: string;
    spec: ActionIntakeSpec;
    field_options?: Partial<Record<string, readonly IntakeSelectOption[]>>;
}): IntakeDebugTrace {
    const extraction = extractFactsFromText({ text: input.text });
    const mapping = mapFactsToActionIntake({
        extraction,
        spec: input.spec,
        field_options: input.field_options,
    });
    const household = mapping.household ?? groupFactsIntoHouseholdCandidates(extraction.facts);

    return {
        raw_text: input.text,
        facts: extraction.facts,
        household,
        mapped_fields: mapping.candidates.map((c) => ({
            payload_key: c.payload_key,
            value: c.display_value ?? c.value,
            confidence: c.confidence,
        })),
        review_warnings: formatIntakeReviewWarnings(
            mapping.review_warning_items ?? household.review_warnings,
        ),
        commit_limited: household.commit_limited_to_primary ?? false,
    };
}

/** Dev-only console trace for intake pipeline debugging. */
export function logIntakeDebugTrace(trace: IntakeDebugTrace, label = "intake-debug"): void {
    if (typeof process !== "undefined" && process.env.NODE_ENV === "production") return;
    console.groupCollapsed(`[${label}] intake pipeline`);
    console.log("raw_text", trace.raw_text);
    console.log("facts", trace.facts);
    console.log("household", trace.household);
    console.log("mapped_fields", trace.mapped_fields);
    console.log("review_warnings", trace.review_warnings);
    console.log("commit_limited", trace.commit_limited);
    console.groupEnd();
}
