/**
 * Governed pivot-style definition compiler.
 * Structured operator choices → existing OrgCalcExpr AST. No freeform formula language.
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

export type PivotBuilderDraft = {
    name: string;
    grain: PivotGrain;
    /** Primary value fact */
    valueRef: ApprovedInputRef;
    /** Optional second operand for binary / call ops */
    compareRef?: ApprovedInputRef | null;
    operator: PivotOperatorLabel;
    /** When true, multiply result by 100 (percentage display) */
    asPercentage: boolean;
    outputUnit: "seats" | "percent" | "number";
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

export function compilePivotBuilderDraft(draft: PivotBuilderDraft): OrgCalcExpr {
    const left: OrgCalcExpr = { kind: "input", ref: draft.valueRef, id: "value" };
    let core: OrgCalcExpr = left;

    if (draft.operator === "Minimum of" || draft.operator === "Maximum of" || draft.operator === "Use first available value") {
        if (!draft.compareRef) throw new Error("Choose a second value for this calculation.");
        const right: OrgCalcExpr = { kind: "input", ref: draft.compareRef, id: "compare" };
        core = {
            kind: "call",
            fn: draft.operator === "Minimum of" ? "min" : draft.operator === "Maximum of" ? "max" : "coalesce",
            id: "combine",
            args: [left, right],
        };
    } else {
        const binary = OP_TO_BINARY[draft.operator];
        if (!binary) throw new Error("Unsupported calculation.");
        if (!draft.compareRef) throw new Error("Choose a second value for this calculation.");
        core = {
            kind: "binary",
            op: binary,
            id: "combine",
            left,
            right: { kind: "input", ref: draft.compareRef, id: "compare" },
        };
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

/** Preset: Room Utilization */
export function roomUtilizationPivotDraft(name = "Room Utilization"): PivotBuilderDraft {
    return {
        name,
        grain: "room",
        valueRef: "occupancy.expected",
        compareRef: "capacity.room_binding.binding",
        operator: "Divide",
        asPercentage: true,
        outputUnit: "percent",
    };
}
