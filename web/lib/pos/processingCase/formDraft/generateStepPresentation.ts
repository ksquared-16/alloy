/**
 * Generate-step presentation helpers — included field summaries grouped by section.
 */

import {
    classifyReviewQuestionMapping,
    expandQuestionsForDraftSave,
    formatReviewDestinationDisplay,
    type ExpandQuestionsOptions,
    type ReviewQuestionInput,
} from "./questionResolutionModel";

export type GenerateIncludedFieldRow = {
    label: string;
    destination: string;
    disposition: ReturnType<typeof classifyReviewQuestionMapping>;
};

export type GenerateIncludedSection = {
    title: string;
    fields: GenerateIncludedFieldRow[];
};

export function summarizeGenerateIncludedFields(
    questions: readonly ReviewQuestionInput[],
    options?: ExpandQuestionsOptions
): GenerateIncludedSection[] {
    const expanded = expandQuestionsForDraftSave(questions, options);
    const bySection = new Map<string, GenerateIncludedFieldRow[]>();
    const order: string[] = [];

    for (const question of questions) {
        if (question.ignored) continue;
        const disposition = classifyReviewQuestionMapping(question);
        if (disposition === "ignored") continue;

        const section = question.section?.trim() || "Questions";
        if (!bySection.has(section)) {
            bySection.set(section, []);
            order.push(section);
        }

        const destination =
            options?.generateAnyway && disposition === "unresolved"
                ? "Form field only (unresolved)"
                : formatReviewDestinationDisplay(question);

        bySection.get(section)!.push({
            label: question.displayLabel.trim() || question.evidenceLabel.trim() || "Untitled question",
            destination,
            disposition,
        });
    }

    // Include split-name expansions that may not map 1:1 back to questions.
    if (expanded.length > questions.filter((q) => !q.ignored).length) {
        for (const field of expanded) {
            const section = field.section?.trim() || "Questions";
            if (!bySection.has(section)) {
                bySection.set(section, []);
                order.push(section);
            }
            const exists = bySection.get(section)!.some((row) => row.label === field.label);
            if (exists) continue;
            bySection.get(section)!.push({
                label: field.label,
                destination: field.field_source ? formatReviewDestinationDisplay({
                    id: "split",
                    evidenceLabel: field.label,
                    displayLabel: field.label,
                    type: field.type ?? "text",
                    section,
                    field_source: field.field_source,
                }) : field.description ? "Form field only (unresolved)" : "Form field only",
                disposition: field.field_source ? "mapped" : "form_field_only",
            });
        }
    }

    return order.map((title) => ({ title, fields: bySection.get(title) ?? [] }));
}

export function countReviewMappingDispositions(questions: readonly ReviewQuestionInput[]) {
    let mapped = 0;
    let formFieldOnly = 0;
    let ignored = 0;
    let unresolved = 0;
    for (const q of questions) {
        const disposition = classifyReviewQuestionMapping(q);
        if (disposition === "ignored") ignored += 1;
        else if (disposition === "form_field_only") formFieldOnly += 1;
        else if (disposition === "unresolved") unresolved += 1;
        else mapped += 1;
    }
    return { mapped, formFieldOnly, ignored, unresolved };
}
