import type { ActionIntakeSpec } from "@/lib/lifecycle/actionIntakeSpecTypes";
import { buildCreateLeadCommitPreview } from "@/lib/admin/actions/buildCreateLeadCommitPreview";
import { buildCreateLeadCommitSelection } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { extractFactsFromText } from "@/lib/intake/extract/extractFactsFromText";
import { groupFactsIntoHouseholdCandidates } from "@/lib/intake/group/groupFactsIntoHouseholdCandidates";
import { mapFactsToActionIntake } from "@/lib/intake/map/mapFactsToActionIntake";
import { summarizeHouseholdRelationships } from "@/lib/intake/relationship/buildHouseholdRelationships";
import type { CreateLeadCommitPreview } from "@/lib/admin/actions/buildCreateLeadCommitPreview";
import type { IntakeHouseholdCandidate, IntakeSelectOption } from "@/lib/intake/types";
import { formatIntakeReviewWarnings } from "@/lib/intake/review/intakeReviewWarnings";

export type IntakeDebugTrace = {
    raw_text: string;
    facts: ReturnType<typeof extractFactsFromText>["facts"];
    household: IntakeHouseholdCandidate;
    relationships: string[];
    mapped_fields: Array<{ payload_key: string; value: string; confidence: string }>;
    commit_preview: CreateLeadCommitPreview;
    review_warnings: string[];
    unmapped_fact_ids: string[];
    commit_limited: boolean;
};

function valuesFromMappedFields(
    mapped: ReturnType<typeof mapFactsToActionIntake>["candidates"],
): Record<string, string> {
    const out: Record<string, string> = {};
    for (const field of mapped) {
        if (field.value) out[field.payload_key] = field.value;
    }
    return out;
}

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
    const values = valuesFromMappedFields(mapping.candidates);
    const selection = household ? buildCreateLeadCommitSelection(household) : null;

    return {
        raw_text: input.text,
        facts: extraction.facts,
        household,
        relationships: summarizeHouseholdRelationships({
            parents: household.parents_guardians?.length ? household.parents_guardians : household.parents,
            children: household.children,
            relationships: household.relationships,
        }),
        mapped_fields: mapping.candidates.map((c) => ({
            payload_key: c.payload_key,
            value: c.display_value ?? c.value,
            confidence: c.confidence,
        })),
        commit_preview: buildCreateLeadCommitPreview({ values, household, selection }),
        review_warnings: formatIntakeReviewWarnings(
            mapping.review_warning_items ?? household.review_warnings,
        ),
        unmapped_fact_ids: household.unassigned_fact_ids,
        commit_limited: household.commit_limited_to_primary ?? false,
    };
}

/** Dev-only console trace for intake pipeline debugging. */
export function logIntakeDebugTrace(trace: IntakeDebugTrace, label = "intake-debug"): void {
    if (typeof process !== "undefined" && process.env.NODE_ENV === "production") return;
    console.groupCollapsed(`[${label}] intake pipeline`);
    console.log("1. raw input", trace.raw_text);
    console.log("2. extracted facts", trace.facts);
    console.log("3. household graph", trace.household);
    console.log("4. relationships", trace.relationships);
    console.log("5. mapped fields", trace.mapped_fields);
    console.log("6. commit preview", trace.commit_preview);
    console.log("7. review warnings", trace.review_warnings);
    console.log("unmapped_fact_ids", trace.unmapped_fact_ids);
    console.log("commit_limited", trace.commit_limited);
    console.groupEnd();
}
