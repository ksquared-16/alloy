/**
 * Plain-language definition summary for the Calculation Library builder.
 */

import type { PivotBuilderDraft } from "@/lib/organizationCalculations/pivotBuilder";
import type {
    PublishedEquivalencyOption,
    PublishedPopulationOption,
} from "@/lib/organizationCalculations/definitionCatalog";
import { catalogLabelForRef } from "@/lib/organizationCalculations/catalog";

export function plainLanguageDefinitionSummary(args: {
    draft: PivotBuilderDraft;
    population: PublishedPopulationOption | null;
    weighting: PublishedEquivalencyOption | null;
    equivalency?: PublishedEquivalencyOption | null;
}): string {
    const { draft, population } = args;
    const equivalency = args.equivalency ?? args.weighting;
    const subject = "each room";

    if (draft.valueMode === "equivalent_count") {
        const who = population?.name ?? "the selected population";
        const how = equivalency?.name ?? "the selected equivalency";
        if (draft.compareRef && draft.operator === "Divide") {
            const denom = catalogLabelForRef(draft.compareRef);
            return draft.asPercentage ?
                    `${capitalize(who)} is converted into equivalent children using ${how}, divided by ${denom.toLowerCase()}, and shown as a percentage for ${subject}.`
                :   `${capitalize(who)} is converted into equivalent children using ${how} and divided by ${denom.toLowerCase()} for ${subject}.`;
        }
        return `For ${subject}, include ${who} and treat each child using ${how}.`;
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
                `For ${subject}, ${op} ${value.toLowerCase()} and ${compare.toLowerCase()}, then show the result as a percentage.`
            :   `For ${subject}, ${op} ${value.toLowerCase()} and ${compare.toLowerCase()}.`;
    }
    return `For ${subject}, return ${value.toLowerCase()}.`;
}

function capitalize(s: string): string {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
}

export function compactSymbolicDefinition(args: {
    draft: PivotBuilderDraft;
    population: PublishedPopulationOption | null;
    weighting: PublishedEquivalencyOption | null;
    equivalency?: PublishedEquivalencyOption | null;
}): string {
    const { draft, population } = args;
    const equivalency = args.equivalency ?? args.weighting;
    const left =
        draft.valueMode === "equivalent_count" ?
            population && equivalency ?
                `Equivalent children (${population.name} · ${equivalency.name})`
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
