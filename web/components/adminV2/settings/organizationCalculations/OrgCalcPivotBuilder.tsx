"use client";

/**
 * Governed pivot-style composer — operator controls compile to OrgCalcExpr AST.
 * Does not expose AST in the UI.
 */

import { useMemo, useState } from "react";
import {
    compilePivotBuilderDraft,
    listPivotValueChoices,
    roomUtilizationPivotDraft,
    type PivotBuilderDraft,
    type PivotOperatorLabel,
} from "@/lib/organizationCalculations/pivotBuilder";
import type { ApprovedInputRef } from "@/lib/organizationCalculations/catalog";
import { inferProductTypeFromAst, type OrgCalcProductTypeId } from "@/lib/organizationCalculations/productCatalog";

const OPERATORS: PivotOperatorLabel[] = [
    "Add",
    "Subtract",
    "Multiply",
    "Divide",
    "Minimum of",
    "Maximum of",
    "Use first available value",
];

export type OrgCalcPivotBuilderProps = {
    draft: PivotBuilderDraft;
    onChange: (next: PivotBuilderDraft) => void;
    disabled?: boolean;
};

export function defaultPivotDraftForProduct(productTypeId: OrgCalcProductTypeId): PivotBuilderDraft {
    if (productTypeId === "room_utilization_pct") return roomUtilizationPivotDraft();
    if (productTypeId === "capacity_operational_with_fallback") {
        return {
            name: "Operational seats when available",
            grain: "room",
            valueRef: "capacity.room_binding.operational",
            compareRef: "capacity.room_binding.physical",
            operator: "Use first available value",
            asPercentage: false,
            outputUnit: "seats",
        };
    }
    return {
        name: "Lower of physical and licensed seats",
        grain: "room",
        valueRef: "capacity.room_binding.physical",
        compareRef: "capacity.room_binding.licensed",
        operator: "Minimum of",
        asPercentage: false,
        outputUnit: "seats",
    };
}

export default function OrgCalcPivotBuilder({ draft, onChange, disabled }: OrgCalcPivotBuilderProps) {
    const choices = useMemo(() => listPivotValueChoices(), []);
    const previewAst = useMemo(() => {
        try {
            return compilePivotBuilderDraft(draft);
        } catch {
            return null;
        }
    }, [draft]);
    const inferred = previewAst ? inferProductTypeFromAst(previewAst) : null;

    return (
        <div className="space-y-4" data-testid="org-calc-pivot-builder">
            <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                    Calculated for
                </p>
                <p className="mt-1 text-sm font-medium text-alloy-midnight">Each room</p>
            </div>

            <div className="rounded-lg border border-alloy-stone/20 bg-white/70 p-4 space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                    Build the answer
                </p>
                <label className="block space-y-1">
                    <span className="config-typo-field-label">Value</span>
                    <select
                        className="config-runtime-input"
                        disabled={disabled}
                        value={draft.valueRef}
                        onChange={(e) =>
                            onChange({ ...draft, valueRef: e.target.value as ApprovedInputRef })
                        }
                        data-testid="pivot-value-ref"
                    >
                        {choices.map((c) => (
                            <option key={c.ref} value={c.ref}>
                                {c.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block space-y-1">
                    <span className="config-typo-field-label">Calculation</span>
                    <select
                        className="config-runtime-input"
                        disabled={disabled}
                        value={draft.operator}
                        onChange={(e) =>
                            onChange({ ...draft, operator: e.target.value as PivotOperatorLabel })
                        }
                        data-testid="pivot-operator"
                    >
                        {OPERATORS.map((op) => (
                            <option key={op} value={op}>
                                {op}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block space-y-1">
                    <span className="config-typo-field-label">Compared with</span>
                    <select
                        className="config-runtime-input"
                        disabled={disabled}
                        value={draft.compareRef ?? ""}
                        onChange={(e) =>
                            onChange({
                                ...draft,
                                compareRef: (e.target.value || null) as ApprovedInputRef | null,
                            })
                        }
                        data-testid="pivot-compare-ref"
                    >
                        <option value="">Select…</option>
                        {choices.map((c) => (
                            <option key={c.ref} value={c.ref}>
                                {c.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        disabled={disabled}
                        checked={draft.asPercentage}
                        onChange={(e) =>
                            onChange({
                                ...draft,
                                asPercentage: e.target.checked,
                                outputUnit: e.target.checked ? "percent" : "seats",
                            })
                        }
                        data-testid="pivot-as-percentage"
                    />
                    <span>Display as percentage (× 100)</span>
                </label>
            </div>

            <div className="rounded-md border border-alloy-stone/15 bg-[#00a283]/5 px-3 py-2 text-sm text-alloy-midnight/80">
                <span className="font-medium text-alloy-midnight">Result: </span>
                {draft.asPercentage ? "Percentage" : "Number of seats"}
                {inferred ? ` · Matches “${inferred.title}” when saved` : ""}
            </div>
        </div>
    );
}

/** Hook-friendly controlled draft for new-definition flow */
export function usePivotDraft(initial?: PivotBuilderDraft) {
    return useState<PivotBuilderDraft>(initial ?? roomUtilizationPivotDraft("New reusable definition"));
}
