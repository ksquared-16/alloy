/**
 * Governed pivot-style definition compiler (Builder V3).
 * Population + Weighting + Compare → OrgCalcExpr. No freeform formulas.
 */

import type { OrgCalcExpr } from "@/lib/organizationCalculations/ast";
import type { ApprovedInputRef } from "@/lib/organizationCalculations/catalog";
import { CATALOG_INPUTS } from "@/lib/organizationCalculations/catalog";

export type PivotGrain = "room";

export type PivotOperatorLabel =
    | "Add"
    | "Subtract"
    | "Multiply"
    | "Divide"
    | "Minimum of"
    | "Maximum of"
    | "Use first available value";

export type PivotValueMode = "catalog_input" | "equivalent_count";

export type PivotBuilderDraft = {
    name: string;
    grain: PivotGrain;
    valueMode: PivotValueMode;
    /** When valueMode === catalog_input */
    valueRef?: ApprovedInputRef | null;
    /** When valueMode === equivalent_count — exact published version ids */
    populationVersionId?: string | null;
    weightingVersionId?: string | null;
    /** Optional second operand for binary / call ops */
    compareRef?: ApprovedInputRef | null;
    operator: PivotOperatorLabel;
    /** When true, multiply result by 100 (percentage display) */
    asPercentage: boolean;
    outputUnit: "seats" | "percent" | "number" | "children";
};

const OP_TO_BINARY: Partial<Record<PivotOperatorLabel, "add" | "sub" | "mul" | "div">> = {
    Add: "add",
    Subtract: "sub",
    Multiply: "mul",
    Divide: "div",
};

export function listPivotValueChoices(): Array<{ ref: ApprovedInputRef; label: string }> {
    return CATALOG_INPUTS.map((i) => ({ ref: i.ref, label: i.label }));
}

function buildValueExpr(draft: PivotBuilderDraft): OrgCalcExpr {
    if (draft.valueMode === "equivalent_count") {
        if (!draft.populationVersionId?.trim() || !draft.weightingVersionId?.trim()) {
            throw new Error("Choose a population and a weighting.");
        }
        return {
            kind: "equivalent_count",
            population_version_id: draft.populationVersionId.trim(),
            weighting_version_id: draft.weightingVersionId.trim(),
            id: "value",
        };
    }
    if (!draft.valueRef) throw new Error("Choose a value.");
    return { kind: "input", ref: draft.valueRef, id: "value" };
}

export function compilePivotBuilderDraft(draft: PivotBuilderDraft): OrgCalcExpr {
    const left = buildValueExpr(draft);
    let core: OrgCalcExpr = left;

    const needsCompare =
        draft.operator === "Minimum of"
        || draft.operator === "Maximum of"
        || draft.operator === "Use first available value"
        || Boolean(OP_TO_BINARY[draft.operator]);

    if (needsCompare && draft.compareRef) {
        const right: OrgCalcExpr = { kind: "input", ref: draft.compareRef, id: "compare" };
        if (
            draft.operator === "Minimum of"
            || draft.operator === "Maximum of"
            || draft.operator === "Use first available value"
        ) {
            core = {
                kind: "call",
                fn:
                    draft.operator === "Minimum of" ? "min"
                    : draft.operator === "Maximum of" ? "max"
                    : "coalesce",
                id: "combine",
                args: [left, right],
            };
        } else {
            const binary = OP_TO_BINARY[draft.operator];
            if (!binary) throw new Error("Unsupported calculation.");
            core = {
                kind: "binary",
                op: binary,
                id: "combine",
                left,
                right,
            };
        }
    } else if (needsCompare && !draft.compareRef && draft.operator !== "Add") {
        // Value-only equivalent count / count products — no compare required when operator unused
        if (
            draft.valueMode === "equivalent_count"
            && (draft.operator === "Divide" || draft.operator === "Multiply")
        ) {
            throw new Error("Choose what to compare with.");
        }
    }

    if (draft.asPercentage) {
        return {
            kind: "binary",
            op: "mul",
            id: "root",
            left: core,
            right: { kind: "const", value: 100, id: "pct" },
        };
    }
    return { ...core, id: "root" };
}

/** Preset: Room Utilization (unweighted / catalog occupancy) */
export function roomUtilizationPivotDraft(name = "Room Utilization"): PivotBuilderDraft {
    return {
        name,
        grain: "room",
        valueMode: "catalog_input",
        valueRef: "occupancy.expected",
        compareRef: "capacity.room_binding.binding",
        operator: "Divide",
        asPercentage: true,
        outputUnit: "percent",
    };
}

/** Preset: Room Utilization with FTE equivalent count */
export function roomUtilizationFtePivotDraft(args: {
    name?: string;
    populationVersionId: string;
    weightingVersionId: string;
}): PivotBuilderDraft {
    return {
        name: args.name ?? "Room Utilization (FTE)",
        grain: "room",
        valueMode: "equivalent_count",
        populationVersionId: args.populationVersionId,
        weightingVersionId: args.weightingVersionId,
        compareRef: "capacity.room_binding.binding",
        operator: "Divide",
        asPercentage: true,
        outputUnit: "percent",
    };
}

/** Preset: Equivalent child count alone */
export function equivalentChildCountPivotDraft(args: {
    name?: string;
    populationVersionId: string;
    weightingVersionId: string;
}): PivotBuilderDraft {
    return {
        name: args.name ?? "Equivalent Child Count",
        grain: "room",
        valueMode: "equivalent_count",
        populationVersionId: args.populationVersionId,
        weightingVersionId: args.weightingVersionId,
        compareRef: null,
        operator: "Add",
        asPercentage: false,
        outputUnit: "children",
    };
}
