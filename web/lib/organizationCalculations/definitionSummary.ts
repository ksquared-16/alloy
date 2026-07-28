/**
 * Plain-language definition summary for the Calculation Library builder.
 */

import type { PivotBuilderDraft } from "@/lib/organizationCalculations/pivotBuilder";
import type {
    PublishedPopulationOption,
    PublishedWeightingOption,
} from "@/lib/organizationCalculations/definitionCatalog";
import { catalogLabelForRef } from "@/lib/organizationCalculations/catalog";

export function plainLanguageDefinitionSummary(args: {
    draft: PivotBuilderDraft;
    population: PublishedPopulationOption | null;
    weighting: PublishedWeightingOption | null;
}): string {
    const { draft, population, weighting } = args;
    const subject = "each room";

    if (draft.valueMode === "equivalent_count") {
        const who = population?.name ?? "the selected population";
        const how = weighting?.name ?? "the selected weighting";
        if (draft.compareRef && draft.operator === "Divide") {
            const denom = catalogLabelForRef(draft.compareRef);
            return draft.asPercentage ?
                    `This definition calculates utilization for ${subject} by converting ${who} using ${how}, dividing by ${denom.toLowerCase()}, and displaying the result as a percentage.`
                :   `This definition calculates a ratio for ${subject} by converting ${who} using ${how} and dividing by ${denom.toLowerCase()}.`;
        }
        return `This definition calculates an equivalent count for ${subject} by including ${who} and applying ${how}.`;
    }

    const value = draft.valueRef ? catalogLabelForRef(draft.valueRef) : "the selected value";
    if (draft.compareRef) {
        const compare = catalogLabelForRef(draft.compareRef);
        const op =
            draft.operator === "Divide" ? "dividing"
            : draft.operator === "Multiply" ? "multiplying"
            : draft.operator === "Minimum of" ? "taking the lower of"
            : draft.operator === "Maximum of" ? "taking the higher of"
            : draft.operator === "Use first available value" ? "using the first available of"
            : draft.operator.toLowerCase();
        return draft.asPercentage ?
                `This definition calculates a percentage for ${subject} by ${op} ${value.toLowerCase()} and ${compare.toLowerCase()}, then multiplying by 100.`
            :   `This definition calculates a result for ${subject} by ${op} ${value.toLowerCase()} and ${compare.toLowerCase()}.`;
    }
    return `This definition returns ${value.toLowerCase()} for ${subject}.`;
}

export function compactSymbolicDefinition(args: {
    draft: PivotBuilderDraft;
    population: PublishedPopulationOption | null;
    weighting: PublishedWeightingOption | null;
}): string {
    const { draft, population, weighting } = args;
    const left =
        draft.valueMode === "equivalent_count" ?
            population && weighting ?
                `Equivalent(${population.name} × ${weighting.name})`
            :   "Equivalent children"
        : draft.valueRef ?
            catalogLabelForRef(draft.valueRef)
        :   "Value";

    if (!draft.compareRef) {
        return draft.asPercentage ? `${left} × 100` : left;
    }
    const right = catalogLabelForRef(draft.compareRef);
    const op =
        draft.operator === "Divide" ? "÷"
        : draft.operator === "Multiply" ? "×"
        : draft.operator === "Add" ? "+"
        : draft.operator === "Subtract" ? "−"
        : draft.operator === "Minimum of" ? "min"
        : draft.operator === "Maximum of" ? "max"
        : "coalesce";
    const core =
        op === "min" || op === "max" || op === "coalesce" ?
            `${op}(${left}, ${right})`
        :   `${left} ${op} ${right}`;
    return draft.asPercentage ? `${core} × 100` : core;
}
